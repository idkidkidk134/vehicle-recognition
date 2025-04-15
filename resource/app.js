// 全局变量
let processingTaskId = null;
let lastStatsData = null;
let pollingInterval = null;
let congestionIndex = 0;
let lastVehicleCount = 0;
let lastUpdateTime = Date.now();

const CONGESTION_THRESHOLD = 2;

let recognition;
let isListening = false;

function openQA() {
  document.getElementById('qaContainer').style.display = 'block';

  // 检查浏览器是否支持语音识别
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    document.getElementById('startRecognition').style.display = 'none';
    console.log('浏览器不支持语音识别API');
  }
}

function closeQA() {
  document.getElementById('qaContainer').style.display = 'none';
  // 如果正在录音，停止录音
  if (isListening && recognition) {
    recognition.stop();
  }
}

function startSpeechRecognition() {
  const questionInput = document.getElementById('questionInput');
  const micButton = document.getElementById('startRecognition');
  const micIcon = document.getElementById('micIcon');
  const recognitionText = document.getElementById('recognitionText');

  // 检查浏览器支持
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('您的浏览器不支持语音识别功能，请使用Chrome或Edge浏览器。');
    return;
  }

  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
  }

  if (!isListening) {
    // 开始识别
    try {
      recognition.start();
      micButton.classList.add('listening');
      micIcon.textContent = '🔴';
      recognitionText.textContent = '停止录音';
      questionInput.placeholder = '请说话...';
      isListening = true;

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        questionInput.value = transcript;
        stopRecognition();
      };

      recognition.onerror = (event) => {
        console.error('语音识别错误:', event.error);
        stopRecognition();
        questionInput.placeholder = '识别错误，请重试...';
      };

      recognition.onend = () => {
        if (isListening) {
          recognition.start(); // 如果仍在监听状态，则重新开始
        }
      };
    } catch (error) {
      console.error('无法启动语音识别:', error);
      stopRecognition();
    }
  } else {
    stopRecognition();
  }
}

function stopRecognition() {
  if (recognition) {
    recognition.stop();
  }
  const micButton = document.getElementById('startRecognition');
  const micIcon = document.getElementById('micIcon');
  const recognitionText = document.getElementById('recognitionText');

  micButton.classList.remove('listening');
  micIcon.textContent = '🎤';
  recognitionText.textContent = '语音输入';
  isListening = false;
}

// 确保DOM加载完成后才可操作

// 初始化事件监听
document.addEventListener('DOMContentLoaded', function() {
document.getElementById('videoUpload').addEventListener('change', function(e) {
const file = e.target.files[0];
if (!file) return;

const videoURL = URL.createObjectURL(file);
const originalVideo = document.getElementById('originalVideo');
originalVideo.src = videoURL;
originalVideo.style.display = 'block';
document.getElementById('statusMessage').textContent = '视频已选择，点击"开始处理"按钮继续';
});
});

// 开始上传和处理
async function startUpload() {
const fileInput = document.getElementById('videoUpload');
const file = fileInput.files[0];
if (!file) {
showError('请先选择视频文件');
return;
}

// 重置UI状态
resetUI();
document.getElementById('loadingText').style.display = 'block';
document.getElementById('statusMessage').textContent = '正在初始化处理任务...';
document.getElementById('statusMessage').className = 'success-message';

try {
// 1. 创建处理任务
const taskResponse = await fetch("http://127.0.0.1:8000/create_task/", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ filename: file.name })
});

if (!taskResponse.ok) {
throw new Error('创建任务失败: ' + taskResponse.statusText);
}

const taskData = await taskResponse.json();
processingTaskId = taskData.task_id;
document.getElementById('statusMessage').textContent = '任务创建成功，开始上传视频...';

// 2. 上传视频文件
const formData = new FormData();
formData.append("file", file);
formData.append("task_id", processingTaskId);

const uploadResponse = await fetch("http://127.0.0.1:8000/upload_video/", {
method: "POST",
body: formData
});

if (!uploadResponse.ok) {
throw new Error('视频上传失败: ' + uploadResponse.statusText);
}

document.getElementById('statusMessage').textContent = '视频上传成功，开始处理...';

// 3. 开始轮询处理进度
startPollingStats();

} catch (error) {
showError('处理失败: ' + error.message);
document.getElementById('loadingText').style.display = 'none';
if (pollingInterval) clearInterval(pollingInterval);
}
}

// 开始轮询处理状态
function startPollingStats() {
// 先立即获取一次状态
pollStats();

// 然后设置定时器
pollingInterval = setInterval(pollStats, 1000);
}
let lastTotalVehicles = 0; // 新增：记录上一次的总车辆数
let lastPollTime = 0;     // 新增：记录上一次轮询的时间戳
// 获取处理状态和统计数据
// 全局变量
// 全局变量
let lastPollData = null; // 记录上次轮询的数据 {timestamp, total_vehicles}
function getCongestionLevel(index) {
    index = index || 0;
    if (index <= 1) return "正常";
    if (index <= 5) return "1度拥堵";
    if (index <= 10) return "2度拥堵";
    if (index <= 20) return "3度拥堵";
    return "严重拥堵";
}
async function pollStats() {
    if (!processingTaskId) return;
    if (!lastPollData) {
    lastPollData = { timestamp: Date.now(), total_vehicles: 0 };
}


    try {
        const response = await fetch(`http://127.0.0.1:8000/get_stats/?task_id=${processingTaskId}`);
        if (!response.ok) {
            throw new Error('获取状态失败: ' + response.statusText);
        }

        const stats = await response.json();

        // ========== 新增：处理完成时关闭轮询 ==========
        if (  stats.status === "completed") {  // 或

            clearInterval(pollingInterval);
            pollingInterval = null;  // 清除引用
            console.log("✅ 视频处理完成，已停止轮询");
  window.lastStatsData = {
                ...stats,
                congestion_index: Math.round(congestionIndex * 10) / 10,
                congestion_level: getCongestionLevel(congestionIndex)
            };
            // 更新UI状态
            document.getElementById('loadingText').style.display = 'none';
            document.getElementById('statusMessage').textContent = '处理完成！';
            document.getElementById('statusMessage').className = 'success-message';
             // 确保后续提问可用

              if (stats.video_url) {
        document.getElementById('processedVideo').src = stats.video_url;
        document.getElementById('downloadLink').style.display = 'inline';
        document.getElementById('downloadLink').href = stats.video_url;
    }
            document.getElementById('questionInput').disabled = false;
            return; // 提前返回不再执行后续更新
        }
        const now = Date.now();

        // ========== 新增车辆计算开始 ==========
        let newVehicles = 0;
        if (lastPollData) {
            const timeDiffSec = (now - lastPollData.timestamp) / 1000;
            if (timeDiffSec > 0.5) { // 至少0.5秒间隔才计算
                newVehicles = Math.max(0, stats.total_vehicles - lastPollData.total_vehicles);
                // 转换为每秒新增量（补偿时间误差）
                newVehicles = Math.round(newVehicles / timeDiffSec);
            }
        }
        // ========== 新增车辆计算结束 ==========
         const timeElapsed = Math.max((now - lastUpdateTime) / 1000, 0.1); // 转换为秒

if (stats.last_fame_count !== undefined) {
    const currentFrameCount = stats.last_fame_count;
    const frameCountChange = currentFrameCount - lastVehicleCount;
    const changeRate = timeElapsed > 0 ? frameCountChange / timeElapsed : 0;

    // 基础拥堵指数计算（基于当前帧车辆数）
    if (currentFrameCount > CONGESTION_THRESHOLD) {
        // 如果当前帧车辆数超过阈值
        if (changeRate <= 2) {
            // 车辆数增长缓慢（≤2辆/秒），拥堵指数上升
            congestionIndex += timeElapsed * 0.5;
        } else {
            // 车辆数增长快（>2辆/秒），拥堵指数下降
            congestionIndex -= timeElapsed * 0.3;
        }
    } else {
        // 当前帧车辆数低于阈值，拥堵指数快速下降
        congestionIndex -= timeElapsed * 0.7;
    }

    // 确保拥堵指数在0-30范围内
    congestionIndex = Math.max(0, Math.min(congestionIndex, 30));

    // 更新记录值（现在记录的是上一帧的车辆数）
    lastVehicleCount = currentFrameCount;
    lastUpdateTime = now;
}

        // ========== 3. 合并所有统计数据 ==========
        // 合并所有统计数据（只需合并一次）
lastStatsData = {
    ...stats,  // 原始API返回的所有数据
    new_vehicles: newVehicles,
    is_congested: newVehicles > (stats.congestion_threshold || 5),
    congestion_index: Math.round(congestionIndex * 10) / 10,
    congestion_level: getCongestionLevel(congestionIndex),
    // 可以添加其他衍生字段...
};

// 更新轮询记录（只需更新一次）
lastPollData = {
    timestamp: now,
    total_vehicles: stats.total_vehicles || 0
};

        // ========== 保留所有原有实时更新逻辑 ==========
        // 更新进度条
        const progress = stats.progress || 0;
        const progressBar = document.getElementById("progressBar");
        progressBar.style.width = `${progress}%`;
        progressBar.textContent = `${progress}%`;

        // 更新状态消息
        if (progress < 100) {
            document.getElementById('statusMessage').textContent =
                `处理中... ${progress}% 已完成`;
            document.getElementById('statusMessage').className = '';
        } else {
            document.getElementById('statusMessage').textContent = '处理完成！';
            document.getElementById('statusMessage').className = 'success-message';
            document.getElementById('loadingText').style.display = 'none';
            clearInterval(pollingInterval);
        }

        // 更新处理后的视频（如果存在）
        if (stats.video_url) {
            document.getElementById('processedVideo').src = stats.video_url;
            document.getElementById('downloadLink').style.display = 'inline';
            document.getElementById('downloadLink').href = stats.video_url;
        }

        // 更新所有统计UI
        updateStatsUI(lastStatsData);

    } catch (err) {
        console.error("获取统计失败", err);
    }
}

// 更新统计UI（完全保留原有结构，仅增强拥堵显示）
function updateStatsUI(data) {
    if (!data) return;

    // ===== 1. 保留原有车辆统计显示 =====
    document.getElementById('total-vehicles').textContent = data.total_vehicles || "0";
    const detectedCount = data.vehicle_counts ? Object.values(data.vehicle_counts).reduce((a, b) => a + b, 0) : 0;
    document.getElementById('detected-vehicles').textContent = detectedCount;
    document.getElementById('failed-vehicles').textContent = (data.total_vehicles || 0) - detectedCount;

    // ===== 2. 保留原有分类统计显示 =====
    document.getElementById('car-count').textContent = data.vehicle_counts?.car || "0";
    document.getElementById('truck-count').textContent =
        (data.vehicle_counts?.bigtruck || 0) +
        (data.vehicle_counts?.smalltruck || 0) +
        (data.vehicle_counts?.midtruck || 0);
    document.getElementById('motorcycle-count').textContent = "0";
    // 在updateStatsUI中应添加：
    document.getElementById('congestion-alerts').textContent = data.congestion_alerts || "0";
    document.getElementById('bus-count').textContent =
        (data.vehicle_counts?.bigbus || 0) +
        (data.vehicle_counts?.smallbus || 0);
    document.getElementById('other-count').textContent = "0";
    document.getElementById('last_fame_count').textContent =data.last_fame_count ||"0";
    // ===== 3. 保留原有运行数据统计 =====
    document.getElementById('runtime').textContent = data.runtime || "-";
    document.getElementById('frame-count').textContent = data.frame_count || "-";
    document.getElementById('avg-frame-time').textContent = data.avg_frame_time || "-";
    document.getElementById('max-memory').textContent = data.max_memory || "-";

    // ===== 4. 增强新增车辆和拥堵显示 =====
    const newVehiclesElem = document.getElementById('new-vehicles');
    const congestionElem = document.getElementById('congestion-status');

    newVehiclesElem.textContent = data.new_vehicles || "0";

    if (data.is_congested) {
        congestionElem.innerHTML = `⚠️ 拥堵！每秒新增 ${data.new_vehicles} 辆车`;
        congestionElem.style.color = '#ff4d4f';
        congestionElem.style.fontWeight = 'bold';

        // 添加背景闪烁（保留原有UI结构）
        congestionElem.style.animation = 'congestion-blink 1s infinite';
    } else {
        congestionElem.innerHTML = "✓ 交通正常";
        congestionElem.style.color = '#52c41a';
        congestionElem.style.fontWeight = 'normal';
        congestionElem.style.animation = 'none';
    }
    // ===== 5. 新增拥堵指数显示 =====
    const congestionLevelElem = document.getElementById('congestion-level');
    const congestionIndexElem = document.getElementById('congestion-index');

    congestionIndexElem.textContent = data.congestion_index || "0";

    // 根据拥堵等级设置不同样式
    switch(data.congestion_level) {
        case "1度拥堵":
            congestionLevelElem.textContent = "⚠️ 1度拥堵";

            congestionLevelElem.style.color = '#ffa940';
            speakAlert("严重拥堵，请注意！");
            break;
        case "2度拥堵":
            congestionLevelElem.textContent = "⚠️⚠️ 2度拥堵";
            congestionLevelElem.style.color = '#ff7a45';
            break;
        case "3度拥堵":
            congestionLevelElem.textContent = "⚠️⚠️⚠️ 3度拥堵";
            congestionLevelElem.style.color = '#ff4d4f';
            break;
        case "严重拥堵":
            congestionLevelElem.textContent = "❗❗ 严重拥堵";
            congestionLevelElem.style.color = '#cf1322';
            // 触发警报声
             speakAlert("严重拥堵，请注意！");
            break;
        default:
            congestionLevelElem.textContent = "✓ 交通正常";
            congestionLevelElem.style.color = '#52c41a';
    }

}

// 语音播报函数
function speakAlert(message) {
  // 检查浏览器是否支持语音合成
  if ('speechSynthesis' in window) {
    // 创建语音合成实例
    const utterance = new SpeechSynthesisUtterance();
    utterance.text = message;
    utterance.lang = 'zh-CN'; // 设置为中文
    utterance.rate = 0.9; // 语速 (0.1-10)
    utterance.pitch = 1; // 音调 (0-2)
    utterance.volume = 1; // 音量 (0-1)

    // 尝试使用中文语音
    const voices = speechSynthesis.getVoices();
    const chineseVoice = voices.find(voice => voice.lang.includes('zh') || voice.lang.includes('CN'));
    if (chineseVoice) {
      utterance.voice = chineseVoice;
    }

    // 播放语音
    speechSynthesis.speak(utterance);
  } else {
    console.warn('您的浏览器不支持语音播报功能');
  }
}

// 确保语音列表加载完成（某些浏览器需要）
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = function() {
    // 语音列表已加载
  };
}

async function askQuestion() {
    // 1. 获取问题输入
    const question = document.getElementById('questionInput').value.trim();
    if (!question) {
        alert("请输入你的问题");
        return;
    }

    // 2. 检查全局统计数据是否存在（关键修改点）
    if (!window.lastStatsData || typeof window.lastStatsData.total_vehicles === 'undefined') {
        alert("请先完成视频处理并获取统计数据");
        return;
    }

    const responseBox = document.getElementById('answerOutput');
    responseBox.innerText = "正在生成回答，请稍候...";

    // 3. 构造包含统计数据的payload（关键修改点）
    const payload = {
        question: document.getElementById('questionInput').value.trim(),
        stats: {
            total_vehicles: window.lastStatsData.total_vehicles,
            // ...其他统计字段...
            congestion_index: window.lastStatsData.congestion_index,
            congestion_level: window.lastStatsData.congestion_level
        }
    };

    try {
        console.log("📤 发送的payload:", payload); // 调试日志

        const response = await fetch("http://127.0.0.1:8000/qa/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        console.log("📥 后端响应状态:", response.status);

        if (!response.ok) {
            const errorDetail = await response.json().catch(() => ({}));
            console.error("❌ 错误详情:", errorDetail);
            throw new Error(`请求失败: ${response.status} ${errorDetail.message || ''}`);
        }

        const result = await response.json();
        console.log("✅ 成功返回：", result);
        responseBox.innerHTML = `<strong>回答：</strong>${result.answer || "无有效回答"}`;

    } catch (error) {
        console.error("❌ 请求异常：", error);
        responseBox.innerHTML = `<span style="color:red">错误: ${error.message}<br>
                                <small>详细错误请查看控制台(F12)</small></span>`;
    }
}
// 辅助函数
function resetUI() {
document.getElementById('processedVideo').src = '';
document.getElementById('downloadLink').style.display = 'none';
document.getElementById('progressBar').style.width = '0%';
document.getElementById('progressBar').textContent = '0%';
}

function showError(message) {
const elem = document.getElementById('statusMessage');
elem.textContent = message;
elem.className = 'error-message';
}

function showSuccess(message) {
const elem = document.getElementById('statusMessage');
elem.textContent = message;
elem.className = 'success-message';
}

