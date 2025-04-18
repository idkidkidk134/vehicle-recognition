import os
import shutil
import time
import uuid
import asyncio
from typing import Dict
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import cv2
import numpy as np
from ultralytics import YOLO
from sort import Sort
import psutil
import logging
from pydantic import BaseModel
import requests  # 添加这行到所有import语句中

# ------------------ 初始化 ------------------
app = FastAPI(title="车辆检测系统API", version="1.0.0")

# 配置跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 文件夹配置
UPLOAD_FOLDER = "uploads"
PROCESSED_FOLDER = "processed"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# ------------------ 数据模型 ------------------
class ProcessingTask:
    def __init__(self):
        self.task_id = str(uuid.uuid4())
        self.status = "created"  # created -> processing -> completed/failed
        self.progress = 0
        self.stats = {
            "total_vehicles": 0,
            "vehicle_counts": {},
            "runtime": 0,
            "frame_count": 0,
            "fps": 0,
            "start_time": time.time(),
            "last_update": time.time(),
            # 新增字段
            "vehicle_history": [],  # 记录历史车辆数
            "last_vehicle_count": 0,  # 上一秒的车辆数
            "congestion_alerts": 0,  # 拥堵报警次数
            "congestion_threshold": 5,  # 每秒新增车辆阈值
            "last_fame_count":0,
            "congestion_threshold1": 5,  # 滞留车辆阈值
            "stagnation_frames": 200,
            "vehicle_tracking": {},  # {id: {"frames": 滞留帧数, "class": 车型}}
            "last_update_time": time.time()
        }
        self.video_path = None
        self.output_path = None
        self.total_frames = 0
        self.lock = asyncio.Lock()

    async def update_stats(self, frame_count, vehicle_counts, counted_ids,current_frame_vehicles=None):
        """线程安全的统计更新"""
        async with self.lock:
            current_time = time.time()
            elapsed = current_time - self.stats["start_time"]
            current_vehicle_count = len(counted_ids)
            if current_frame_vehicles is not None:
                self.stats["last_fame_count"] = current_frame_vehicles
            # 计算每秒新增车辆数
            new_vehicles = current_vehicle_count - self.stats["last_vehicle_count"]

            # 记录历史数据（每秒一条）
            self.stats["vehicle_history"].append({
                "timestamp": current_time,
                "total_vehicles": current_vehicle_count,
                "new_vehicles": new_vehicles
            })

            # 检查拥堵情况
            if new_vehicles > self.stats["congestion_threshold"]:
                self.stats["congestion_alerts"] += 1
                logger.warning(f"拥堵警报! 每秒新增车辆数: {new_vehicles} (阈值: {self.stats['congestion_threshold']})")

            # 更新最后车辆数
            self.stats["last_vehicle_count"] = current_vehicle_count

            self.stats.update({
                "frame_count": frame_count,
                "total_vehicles": current_vehicle_count,
                "vehicle_counts": vehicle_counts.copy(),
                "runtime": round(elapsed, 2),
                "fps": round(frame_count / elapsed, 1) if elapsed > 0 else 0,
                "last_update": current_time,
                "progress": min(99, int((frame_count / self.total_frames) * 100)) if self.total_frames > 0 else 0,
                "new_vehicles": new_vehicles,  # 新增字段
                "last_vehicle_count": current_vehicle_count,  # 用于前端计算新增
                "last_update_time": current_time,  # 用于前端计算时间差
                "is_congested": new_vehicles > self.stats["congestion_threshold"]  # 新增字段
            })
            return self.stats.copy()

    async def finalize(self, success=True, error=None):
        """完成或失败时调用"""
        async with self.lock:
            if success:
                self.status = "completed"
                self.progress = 100
                process = psutil.Process(os.getpid())
                self.stats["max_memory"] = round(process.memory_info().rss / (1024 * 1024), 2)
            else:
                self.status = "failed"
                self.stats["error"] = str(error)


# ------------------ 全局状态 ------------------
tasks: Dict[str, ProcessingTask] = {}
model_cache = {}
tracker_cache = {}


# ------------------ 工具函数 ------------------
def get_model():
    """获取缓存的YOLO模型"""
    if "model" not in model_cache:
        logger.info("Loading YOLO model...")
        model_cache["model"] = YOLO("yolov8_model/best.pt")
    return model_cache["model"]


def get_tracker():
    """获取缓存的SORT跟踪器"""
    if "tracker" not in tracker_cache:
        tracker_cache["tracker"] = Sort(max_age=30, min_hits=1, iou_threshold=0.2)
    return tracker_cache["tracker"]


async def cleanup_tasks():
    """定期清理已完成的任务"""
    while True:
        await asyncio.sleep(3600)  # 每小时清理一次
        expired = []
        for task_id, task in tasks.items():
            if task.status in ("completed", "failed") and \
                    time.time() - task.stats["last_update"] > 86400:  # 24小时
                expired.append(task_id)

        for task_id in expired:
            try:
                if tasks[task_id].video_path and os.path.exists(tasks[task_id].video_path):
                    os.remove(tasks[task_id].video_path)
                if tasks[task_id].output_path and os.path.exists(tasks[task_id].output_path):
                    os.remove(tasks[task_id].output_path)
                del tasks[task_id]
                logger.info(f"Cleaned up task {task_id}")
            except Exception as e:
                logger.error(f"Cleanup failed for {task_id}: {str(e)}")


# ------------------ 核心处理逻辑 ------------------
async def process_video(task: ProcessingTask):
    """完全异步非阻塞的视频处理函数"""
    try:
        loop = asyncio.get_event_loop()

        # 使用线程池执行同步的OpenCV操作
        def sync_setup():
            cap = cv2.VideoCapture(task.video_path)
            if not cap.isOpened():
                raise ValueError(f"无法打开视频文件: {task.video_path}")

            fps = cap.get(cv2.CAP_PROP_FPS)
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            fourcc = cv2.VideoWriter_fourcc(*'avc1')
            output_path = os.path.join(PROCESSED_FOLDER, f"processed_{os.path.basename(task.video_path)}")
            out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

            return cap, out, total_frames

        cap, out, total_frames = await loop.run_in_executor(None, sync_setup)
        task.total_frames = total_frames
        task.output_path = os.path.join(PROCESSED_FOLDER, f"processed_{os.path.basename(task.video_path)}")
        # 类别配置
        class_names = {
            0: "bigbus", 1: "bigtruck", 2: "busl", 3: "buss", 4: "car",
            5: "midtruck", 6: "smallbus", 7: "smalltruck", 8: "truckl",
            9: "truckm", 10: "trucks", 11: "truckxl"
        }
        category_priority = {
            "truckxl": 3, "bigtruck": 3, "midtruck": 3, "smalltruck": 3,
            "truckl": 3, "truckm": 3, "trucks": 3,
            "bigbus": 2, "busl": 2, "buss": 2, "smallbus": 2,
            "car": 1
        }
        # 初始化检测器
        model = get_model()
        tracker = get_tracker()
        vehicle_counts = {k: 0 for k in class_names.values()}
        counted_ids = set()
        track_history = {}

        frame_count = 0
        last_update_time = time.time()

        while True:
            # 异步读取帧
            ret, frame = await loop.run_in_executor(None, cap.read)
            if not ret:
                break

            frame_count += 1

            # 异步执行检测和跟踪
            def sync_process_frame(frame):
                # 检测
                results = model(frame, conf=0.3, iou=0.3, imgsz=640)
                detections = []
                current_objects = []

                for box in results[0].boxes:
                    if box.conf > 0.3:
                        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                        cls_id = int(box.cls[0])
                        conf = float(box.conf[0])
                        if cls_id in class_names:
                            class_name = class_names[cls_id]
                            detections.append([x1, y1, x2, y2, conf])
                            current_objects.append({
                                "class": class_name,
                                "confidence": conf,
                                "bbox": [x1, y1, x2, y2]
                            })

                # 跟踪
                tracks = tracker.update(np.array(detections)) if detections else []
                return frame, tracks, current_objects

            processed_frame, tracks, current_objects = await loop.run_in_executor(None, sync_process_frame, frame)

            # 处理跟踪结果（非CPU密集型，可直接在异步上下文中执行）
            for t in tracks:
                x1, y1, x2, y2, track_id = map(int, t)
                matched_obj, max_iou = None, 0

                for obj in current_objects:
                    ox1, oy1, ox2, oy2 = obj["bbox"]
                    xi1 = max(x1, ox1)
                    yi1 = max(y1, oy1)
                    xi2 = min(x2, ox2)
                    yi2 = min(y2, oy2)
                    inter_area = max(0, xi2 - xi1) * max(0, yi2 - yi1)
                    box_area = (x2 - x1) * (y2 - y1)
                    obj_area = (ox2 - ox1) * (oy2 - oy1)
                    iou = inter_area / float(box_area + obj_area - inter_area)

                    if iou > max_iou and iou > 0.3:
                        max_iou = iou
                        matched_obj = obj

                if matched_obj:
                    detected_class = matched_obj["class"]

                    # 处理类别变化
                    if track_id in track_history:
                        previous_class = track_history[track_id]
                        if category_priority[previous_class] >= 3:
                            detected_class = previous_class
                        elif category_priority[detected_class] > category_priority[previous_class]:
                            track_history[track_id] = detected_class
                        else:
                            detected_class = previous_class
                    else:
                        track_history[track_id] = detected_class

                    # 计数
                    if track_id not in counted_ids:
                        counted_ids.add(track_id)
                        vehicle_counts[detected_class] += 1

                    # 绘制检测框
                    color = (0, 255, 0)
                    cv2.rectangle(processed_frame, (x1, y1), (x2, y2), color, 2)
                    label = f"{detected_class} ID:{track_id} ({matched_obj['confidence']:.2f})"
                    cv2.putText(processed_frame, label, (x1, y1 - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

            # 异步写入帧
            await loop.run_in_executor(None, out.write, processed_frame)

            # 实时更新统计（无时间间隔限制）
            current_frame_vehicles = len(tracks)  # 或者使用 len(counted_ids) 根据你的需求
            # 更新统计时传入当前帧车辆数
            await task.update_stats(frame_count, vehicle_counts, counted_ids, current_frame_vehicles)
        # 处理完成
        await task.finalize(success=True)
        logger.info(f"Task {task.task_id} completed. Processed {frame_count} frames.")

    except Exception as e:
        logger.error(f"Task {task.task_id} failed: {str(e)}", exc_info=True)
        await task.finalize(success=False, error=e)
        raise
    finally:
        # 确保资源释放
        if 'cap' in locals():
            cap.release()
        if 'out' in locals():
            out.release()
# ------------------ API端点 ------------------
@app.post("/create_task/")
async def create_task():
    """创建新处理任务"""
    task = ProcessingTask()
    tasks[task.task_id] = task
    logger.info(f"Created new task: {task.task_id}")
    return {"task_id": task.task_id}


@app.post("/upload_video/")
async def upload_video(
        task_id: str = Form(...),
        file: UploadFile = File(...)
):
    """上传视频并开始处理"""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = tasks[task_id]

    try:
        # 保存视频
        filename = f"{task_id}_{file.filename}"
        video_path = os.path.join(UPLOAD_FOLDER, filename)
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 更新任务
        task.video_path = video_path
        task.output_path = os.path.join(PROCESSED_FOLDER, f"processed_{filename}")
        task.status = "processing"

        # 启动处理任务
        asyncio.create_task(process_video(task))

        logger.info(f"Started processing for task {task_id}")
        return {"status": "processing_started"}

    except Exception as e:
        logger.error(f"Upload failed for task {task_id}: {str(e)}")
        await task.finalize(success=False, error=e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/get_stats/")
async def get_stats(task_id: str = Query(...)):
    """获取任务统计信息（新增车辆总数和更新时间）"""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = tasks[task_id]
    stats = task.stats.copy()

    # 保持原有基础字段
    result = {
        "status": task.status,
        "progress": stats["progress"],
        "runtime": stats["runtime"],
        "frame_count": stats["frame_count"],
        "fps": stats["fps"],
        # 新增前端计算需要的字段
        "last_fame_count": stats.get("last_fame_count", 0),  # 当前总车辆数
        "last_update_time": stats["last_update"],  # 最后更新时间戳
        # 保留原有完成状态字段
        "video_url": f"/processed/processed_{os.path.basename(task.video_path)}"
        if task.status == "completed" else None
    }

    # 可选：保持向下兼容（如果前端还需要旧字段）
    result.update({
        "total_vehicles": stats["total_vehicles"],  # 别名，与current_vehicles相同
        "vehicle_counts": stats["vehicle_counts"]  # 保留车型分类统计
    })

    return result

class QARequest(BaseModel):
    question: str
    stats: dict


@app.post("/qa/")
async def ask_vehicle_stats(payload: QARequest):
    """
    使用 Ollama 基于识别结果回答用户问题
    """
    system_prompt = "你是一个交通视频分析助手，根据车辆识别统计信息回答问题。"
    context = f"以下是识别出的车辆统计数据：\n{payload.stats}"

    ollama_payload = {
        "model": "DeepSeek-R1:1.5b",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": context},
            {"role": "user", "content": payload.question}
        ],
        "stream": False
    }

    try:
        response = requests.post("http://localhost:11434/api/chat", json=ollama_payload)
        response.raise_for_status()
        answer = response.json()["message"]["content"]
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ollama 访问失败：{str(e)}")
# ------------------ 启动服务 ------------------
@app.on_event("startup")
async def startup_event():
    """启动时初始化"""
    asyncio.create_task(cleanup_tasks())
    logger.info("Service started")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        workers=1,  # 多worker需要共享存储
        timeout_keep_alive=30,
        log_config=None
    )



