# 车辆检测与统计系统

## 项目概述
这是一个基于YOLOv8的车辆检测系统，允许用户通过网页访问，上传视频。系统会识别视频中的车辆类型和数量。

## 功能说明
- 上传视频文件；
- 检测车辆类型并计数；
- 返回包含检测框和统计信息的视频；
- 网页端实时展示结果。

## 技术栈
前端：HTML, JavaScript
后端：FastAPI
AI模型：YOLOv8（PyTorch）
视频处理：OpenCV, SORT

## 安装与使用

### 系统要求

- 操作系统：Linux/ Windows
- Python 版本：3.10 或更高

### 安装依赖

在项目根目录下，运行以下命令以安装依赖：
```
$ pip install -r requirements.txt
```

### 运行

在项目根目录下，运行以下命令：
```
$ python main.py
```

### 访问网页（本地测试）

打开浏览器，访问 `http://localhost:8000/index.html`

## 实现过程

### 数据准备

1. **数据集选择**：
    - 使用了自主采集并标注的数据集。
   
2. **数据清洗与预处理**：
    - 标注转换：用脚本将原始数据集的标注文件转换为 YOLO 格式。

3. **训练/验证集划分**：
    - 为避免过拟合，将80% 的数据用于训练，20% 用于验证。

### 模型训练

1. **模型配置与训练**：
    - 使用 YOLOv8 提供的预训练模型作为基础进行微调（fine-tuning）。加载了一个预训练的权重文件，并使用自定义数据集进行训练。
    - 设置训练参数为。
    - 使用交叉熵损失函数来训练模型，并根据验证集的损失值调整超参数。
   
2. **模型评估与优化**：
    - 每个训练周期结束后，评估模型在验证集上的表现。根据评估结果，调整模型参数。
    - 在训练过程中，防止过拟合现象，避免训练集与验证集之间的性能差异过大。

3. **训练结果**：
   - 经过多轮训练后，模型达到了较高的准确率和较低的推理时间，适合进行实时车辆检测。

### 前端实现

1. **前端页面设计**：
   - 允许用户通过文件选择器上传视频文件。
   - 用两个视频播放器分别展示处理前与处理后的视频。
   - 为处理后的视频提供下载。

2. **前端与后端的交互**：
   - 前端通过 `fetch` 函数将视频文件发送到后端 API，并等待结果。
   - 后端返回处理结果后，前端解析并展示检测到的车辆数量与类型。

3. **视频预览功能**：
   - 前端页面支持上传视频后，在页面上实时展示视频播放效果，让用户在等待结果时能够继续查看视频。
   - 使用 HTML5 `<video>` 标签实现视频播放，配合 JavaScript 控制视频播放进度。

### 后端实现

后端部分负责接收视频文件、调用 YOLOv8 模型进行推理，并返回结果给前端。

1. **文件传输管理**：
   - 后端通过 FastAPI 提供的 API 接口接收前端上传的视频文件。
   - 将用户上传的文件放在uploads文件夹中，处理后的文件放在processed文件夹中。
   ```
   # 文件夹设置
   UPLOAD_FOLDER = "uploads"
   PROCESSED_FOLDER = "processed"
   os.makedirs(UPLOAD_FOLDER, exist_ok=True)
   os.makedirs(PROCESSED_FOLDER, exist_ok=True)
   ```
   - 配置 FastAPI 提供静态文件服务和跨域访问配置。视频处理后的结果存放在 processed 文件夹中。用户可以通过 http://<host>/processed/<filename> 访问。
   ```
   # 配置静态文件服务
   app.mount("/processed", StaticFiles(directory="processed"), name="processed")

   # 允许跨域访问
   app.add_middleware(
       CORSMiddleware,
      allow_origins=["*"],
      allow_credentials=True,
      allow_methods=["*"],
      allow_headers=["*"],
   )
   ```


2. **目标检测推理**：
   - 在process_video函数中，使用 OpenCV 读取视频帧，并将每帧输入到 YOLOv8 模型进行车辆检测。检测到的车辆通过框标记，并通过 SORT 进行目标追踪，将检测框和跟踪框绘制到视频帧上，并统计识别出的不同种类车辆的数量。
   ```
   def process_video(input_path: str, output_path: str):
      """处理视频并统计车辆数据，添加标注框"""
      cap = cv2.VideoCapture(input_path)
      if not cap.isOpened():
         raise ValueError("无法打开视频文件")

      # 获取视频信息
      fps = cap.get(cv2.CAP_PROP_FPS)
      width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
      height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

      # 创建视频写入器
      fourcc = cv2.VideoWriter_fourcc(*'avc1')
      out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

      # 初始化统计变量
      vehicle_counts = {v: 0 for v in class_names.values()}
      counted_ids = set()
      frame_count = 0
      start_time = time.time()

      try:
         while cap.isOpened():
               ret, frame = cap.read()
               if not ret:
                  break
               frame_count += 1

               # YOLO检测
               results = model(frame, conf=0.3, iou=0.3, imgsz=640)
               detections = []
               current_objects = []

               for box in results[0].boxes:
                  if box.conf > 0.3:  # 置信度过滤
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

               # SORT跟踪
               tracks = tracker.update(np.array(detections)) if detections else []

               # 处理跟踪结果
               for t in tracks:
                  x1, y1, x2, y2, track_id = map(int, t)

                  # 匹配类别
                  matched_obj = None
                  max_iou = 0

                  for obj in current_objects:
                     ox1, oy1, ox2, oy2 = obj["bbox"]

                     # 计算IOU
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

                  # 统计并绘制框
                  if matched_obj:
                     class_name = matched_obj["class"]
                     confidence = matched_obj["confidence"]

                     if track_id not in counted_ids:
                           counted_ids.add(track_id)
                           if class_name in vehicle_counts:
                              vehicle_counts[class_name] += 1
                           else:
                              print(f"⚠️ 未知类别: {class_name}")

                     # **🚀 画框**
                     color = (0, 255, 0)  # 绿色框
                     cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

                     # **🚀 显示类别 & ID**
                     label = f"{class_name} ID:{track_id} ({confidence:.2f})"
                     cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

               out.write(frame)

         # 计算性能指标
         end_time = time.time()
         runtime = round(end_time - start_time, 2)
         avg_frame_time = round((runtime / frame_count) * 1000, 2) if frame_count > 0 else 0

         print("🚗 统计结果:", vehicle_counts)  # 调试输出

         return {
               "total_vehicles": len(counted_ids),
               "runtime": runtime,
               "frame_count": frame_count,
               "avg_frame_time": avg_frame_time,
               "vehicle_counts": vehicle_counts
         }

      finally:
         cap.release()
         out.release()

      ```

3. **视频上传与结果返回**:
   -upload_video 是一个 POST 请求的处理函数，用于处理用户上传的视频文件并返回处理后的视频 URL 以及相关统计数据。
   - uploads 文件夹，并生成唯一的文件名。
   - 然后调用 process_video 函数处理视频。
   - 检测结果（如车辆数量、类型、位置等信息）通过 JSON 格式返回给前端。
   ```
   @app.post("/upload/")
   async def upload_video(file: UploadFile = File(...)):
       """处理上传的视频，返回处理后的视频URL和统计信息"""
       try:
           # 生成唯一文件名
           timestamp = int(time.time())
           filename = f"{timestamp}_{file.filename}"
           input_path = os.path.join(UPLOAD_FOLDER, filename)
           output_path = os.path.join(PROCESSED_FOLDER, f"processed_{filename}")

           # 保存上传的视频
           with open(input_path, "wb") as buffer:
               shutil.copyfileobj(file.file, buffer)

           # 处理视频并获取统计数据
           stats = process_video(input_path, output_path)

           return JSONResponse({
               "status": "success",
               "video_url": f"/processed/processed_{filename}",
               **stats
           })

       except Exception as e:
           raise HTTPException(status_code=500, detail=str(e))
   ```

5. **性能优化**：
   - 由于视频处理需要一定时间，后端采用异步处理（通过 FastAPI 的 `async`/`await`），以保证系统的高并发处理能力。
   - 通过对视频帧进行批量处理和并行推理，减少处理时间，提升用户体验。

