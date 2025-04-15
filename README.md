# 车辆检测与统计系统

## 项目概述
这是一个基于YOLOv8的车辆检测系统，允许用户通过网页访问，上传视频。系统会识别视频中的车辆类型和数量。

## 功能说明
- 上传视频文件；
- 检测车辆类型并计数；
- 返回包含检测框和统计信息的视频；
- 网页端实时展示结果。

## 技术栈
- 前端：HTML, JavaScript, CSS
- 后端：FastAPI
- 图像识别AI模型：YOLOv8（PyTorch）
- 视频处理：OpenCV, SORT

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

运行main.py
```
$ python main.py
```

### 访问网页（本地测试）

打开浏览器，访问 `http://localhost:8000/index.html` 即可在网页端使用此系统。
