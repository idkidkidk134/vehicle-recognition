

// 全局变量
let processingTaskId = null;
let lastStatsData = null;
let pollingInterval = null;
let congestionIndex = 0;
let lastVehicleCount = 0;
let lastUpdateTime = Date.now();
let congestionCount = 0; // 拥堵次数计数器
let lastCongestionTime = 0; // 上次记录拥堵的时间戳
let congestionDataBuffer = []; // 拥堵数据缓冲区（用于5秒间隔判断）
const CONGESTION_THRESHOLD = 2;

let recognition;
let isListening = false;
let trafficChart = null;
let chartData = {
  labels: [],
  congestion: [],
  vehicles: []
};
let chartPanelVisible = false;
function initTrafficChart() {
  const ctx = document.getElementById('trafficChart').getContext('2d');

  trafficChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: '拥堵指数',
          data: chartData.congestion,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.1)',
          tension: 0.1,
          yAxisID: 'y'
        },
        {
          label: '车流量(辆)',
          data: chartData.vehicles,
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.1)',
          tension: 0.1,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
        maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: '拥堵指数'
          },
          min: 0,
          max: 30
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: '车流量(辆)'
          },
          grid: {
            drawOnChartArea: false
          },
          min: 0
        }
      }
    }
  });
}

// 更新图表数据
function updateChart() {
  const now = new Date();
  const timeLabel = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;

  // 添加新数据点
  chartData.labels.push(timeLabel);
  chartData.congestion.push(congestionIndex);
  chartData.vehicles.push(lastVehicleCount);

  // 限制数据点数量（例如只保留最近60秒的数据）
  const maxDataPoints = 60;
  if (chartData.labels.length > maxDataPoints) {
    chartData.labels.shift();
    chartData.congestion.shift();
    chartData.vehicles.shift();
  }

  // 更新图表
  if (trafficChart) {
    trafficChart.update();
  }
}

// 切换图表面板显示
function toggleChartPanel() {
  const modal = document.getElementById('chartModal');
  modal.style.display = "block";
chartPanelVisible = true; // 添加这行
  // 首次显示时初始化图表
  if (!trafficChart) {
    initTrafficChart();
  }
    trafficChart.update();
}
function closeChartModal() {
  document.getElementById('chartModal').style.display = "none";
   chartPanelVisible = false; // 添加这行
}
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
 chartData.labels = [];
    chartData.congestion = [];
    chartData.vehicles = [];

    // 如果图表已存在，销毁之前的图表实例
    if (trafficChart) {
        trafficChart.destroy();
        trafficChart = null; // 重置图表变量
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
       if (stats.status === "completed") {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log("✅ 视频处理完成，已停止轮询");

    // 保存最终统计数据
    window.lastStatsData = {
        ...stats,
        congestion_index: Math.round(congestionIndex * 10) / 10,
        congestion_level: getCongestionLevel(congestionIndex),
        video_name: document.getElementById('videoUpload').files[0]?.name || '未知视频',
        timestamp: new Date().toLocaleString()
    };

    // 保存到历史记录 - 新增代码
    saveDetectionHistory(window.lastStatsData);

    // 更新UI状态
    document.getElementById('loadingText').style.display = 'none';
    document.getElementById('statusMessage').textContent = '处理完成！';
    document.getElementById('statusMessage').className = 'success-message';

    if (stats.video_url) {
        document.getElementById('processedVideo').src = stats.video_url;
        document.getElementById('downloadLink').style.display = 'inline';
        document.getElementById('downloadLink').href = stats.video_url;
    }
    document.getElementById('questionInput').disabled = false;
    if (trafficChart) {
            updateChart();
        }
    return;
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
 const currentTime = Date.now();

    // 1. 将当前拥堵数据加入缓冲区（每秒1次）
    congestionDataBuffer.push({
        time: currentTime,
        index: congestionIndex
    });

    // 2. 移除超过5秒的旧数据
    congestionDataBuffer = congestionDataBuffer.filter(
        data => currentTime - data.time <= 5000
    );

    // 3. 检查是否需要增加拥堵计数
    if (congestionDataBuffer.length >= 5) { // 有5秒数据
        // 检查过去5秒内是否有拥堵指数>15的情况
        const hasCongestion = congestionDataBuffer.some(data => data.index >9);

        // 如果满足条件且距离上次计数已超过5秒
        if (hasCongestion && (currentTime - lastCongestionTime >= 5000)) {
            congestionCount++;
            lastCongestionTime = currentTime;

            // 更新UI显示
            document.getElementById('congestion-alerts').textContent = congestionCount;

            // 清空缓冲区，重新开始5秒计时
            congestionDataBuffer = [];

            // 语音提示（可选）
            speakAlert("检测到拥堵，已记录");
        }
    }

    // ========== 合并统计数据时包含拥堵次数 ==========
        if (chartPanelVisible) {
            updateChart();
        }

    lastStatsData = {
        ...stats,
        congestion_index: Math.round(congestionIndex * 10) / 10,
        congestion_level: getCongestionLevel(congestionIndex),
        congestion_alerts: congestionCount, // 添加拥堵次数
        // 其他原有字段...
    };


        // ========== 3. 合并所有统计数据 ==========
        // 合并所有统计数据（只需合并一次）
lastStatsData = {
    ...stats,  // 原始API返回的所有数据
    congestion_index: Math.round(congestionIndex * 10) / 10,
    congestion_level: getCongestionLevel(congestionIndex),
    congestion_alerts: congestionCount,
    new_vehicles: newVehicles,
    is_congested: newVehicles > (stats.congestion_threshold || 5),


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
     if (trafficChart) {
        updateChart();
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

            break;
        case "2度拥堵":
            congestionLevelElem.textContent = "⚠️⚠️ 2度拥堵";
            congestionLevelElem.style.color = '#ff7a45';
            speakAlert("2度拥堵，请注意！");
            break;
        case "3度拥堵":
            congestionLevelElem.textContent = "⚠️⚠️⚠️ 3度拥堵";
            congestionLevelElem.style.color = '#ff4d4f';
             speakAlert("3度拥堵，请注意！");
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

// 在askQuestion函数中添加历史记录保存功能
async function askQuestion() {
    // 1. 获取问题输入
    const question = document.getElementById('questionInput').value.trim();
    if (!question) {
        alert("请输入你的问题");
        return;
    }

    // 2. 检查全局统计数据是否存在
    if (!window.lastStatsData || typeof window.lastStatsData.total_vehicles === 'undefined') {
        alert("请先完成视频处理并获取统计数据");
        return;
    }

    const responseBox = document.getElementById('answerOutput');
    responseBox.innerText = "正在生成回答，请稍候...";

    // 3. 构造包含统计数据的payload
    const payload = {
        question: question,
        stats: {
            total_vehicles: window.lastStatsData.total_vehicles,
            congestion_index: window.lastStatsData.congestion_index,
            congestion_level: window.lastStatsData.congestion_level
        }
    };

    try {
        const response = await fetch("http://127.0.0.1:8000/qa/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`请求失败: ${response.status}`);
        }

        const result = await response.json();
        responseBox.innerHTML = `<strong>回答：</strong>${result.answer || "无有效回答"}`;

        // 保存到历史记录
        saveToHistory(question, result.answer);

    } catch (error) {
        console.error("请求异常：", error);
        responseBox.innerHTML = `<span style="color:red">错误: ${error.message}</span>`;
    }
}

// 保存问答历史到本地存储
function saveToHistory(question, answer) {
    const history = getHistory();
    const newItem = {
        id: Date.now(),
        question: question,
        answer: answer,
        timestamp: new Date().toLocaleString()
    };

    // 添加到历史记录数组开头
    history.unshift(newItem);

    // 限制历史记录数量（最多保留20条）
    if (history.length > 20) {
        history.pop();
    }

    localStorage.setItem('qaHistory', JSON.stringify(history));
}

// 从本地存储获取历史记录
function getHistory() {
    return JSON.parse(localStorage.getItem('qaHistory') || '[]');
}

// 显示历史记录
function showHistory() {
    const historyContainer = document.getElementById('historyContainer');
    const historyList = document.getElementById('historyList');
    const history = getHistory();

    // 清空现有内容
    historyList.innerHTML = '';

    if (history.length === 0) {
        historyList.innerHTML = '<div class="history-empty">暂无历史记录</div>';
    } else {
        history.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <div class="history-question">${item.question}</div>
                <div class="history-answer">${item.answer.substring(0, 60)}...</div>
                <div class="history-time" style="font-size:0.8em;color:#999;">${item.timestamp}</div>
            `;

            // 点击历史记录项时填充问题和答案
            historyItem.onclick = () => {
                document.getElementById('questionInput').value = item.question;
                document.getElementById('answerOutput').innerHTML = `<strong>回答：</strong>${item.answer}`;
                closeHistory();
            };

            historyList.appendChild(historyItem);
        });
    }

    // 显示历史记录容器和遮罩层
    historyContainer.style.display = 'block';
    document.getElementById('overlay').style.display = 'block';
}

// 关闭历史记录
function closeHistory() {
    document.getElementById('historyContainer').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
}

// 在DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 初始化语音识别（原有代码）
     initTrafficChart();
    if (!('webkitSpeechRecognition' in window)) {
        document.getElementById('startRecognition').style.display = 'none';
    }

    // 初始化历史记录（如果有）
    const history = getHistory();
    if (history.length > 0) {
        // 可以在这里做一些初始化操作
    }
});
// 辅助函数
function resetUI() {
document.getElementById('processedVideo').src = '';
document.getElementById('downloadLink').style.display = 'none';
document.getElementById('progressBar').style.width = '0%';
document.getElementById('progressBar').textContent = '0%';
congestionCount = 0;
lastCongestionTime = 0;
congestionDataBuffer = [];
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
/****************************** 历史记录看板功能 ******************************/

// 保存检测历史记录
function saveDetectionHistory(stats) {
    const history = getDetectionHistory();
    const newRecord = {
        id: Date.now(),
        timestamp: new Date().toLocaleString(),
        videoName: stats.video_name,
        totalVehicles: stats.total_vehicles || 0,
        congestionIndex: stats.congestion_index || 0,
        congestionLevel: stats.congestion_level || "正常",
        congestionAlerts: stats.congestion_alerts || 0,
        detectedVehicles: stats.vehicle_counts ? Object.values(stats.vehicle_counts).reduce((a, b) => a + b, 0) : 0,
        failedVehicles: (stats.total_vehicles || 0) - (stats.vehicle_counts ? Object.values(stats.vehicle_counts).reduce((a, b) => a + b, 0) : 0),
        fullData: stats // 保存完整数据以便查看详情
    };

    history.unshift(newRecord);

    // 限制历史记录数量（最多保留50条）
    if (history.length > 50) {
        history.pop();
    }

    localStorage.setItem('detectionHistory', JSON.stringify(history));
}

// 获取检测历史记录
function getDetectionHistory() {
    return JSON.parse(localStorage.getItem('detectionHistory') || '[]');
}

// 打开历史看板
function openDashboard() {
    const dashboard = document.getElementById('historyDashboard');
    dashboard.style.display = 'block';

    // 更新汇总统计
    updateSummaryStats();

    // 更新历史记录表格
    updateHistoryTable();
}

// 关闭历史看板
function closeDashboard() {
    document.getElementById('historyDashboard').style.display = 'none';
}

// 更新汇总统计
function updateSummaryStats() {
    const history = getDetectionHistory();

    const totalDetections = history.length;
    const totalVehicles = history.reduce((sum, record) => sum + (record.totalVehicles || 0), 0);
    const totalAlerts = history.reduce((sum, record) => sum + (record.congestionAlerts || 5), 5);
    const totalFailed = history.reduce((sum, record) => sum + (record.failedVehicles || 0), 0);

    document.getElementById('total-detections').textContent = totalDetections;
    document.getElementById('total-vehicles-detected').textContent = totalVehicles;
    document.getElementById('total-congestion-alerts').textContent = totalAlerts;
    document.getElementById('total-failed-detections').textContent = totalFailed;
}

// 更新历史记录表格
function updateHistoryTable() {
    const history = getDetectionHistory();
    const tableBody = document.getElementById('historyTableBody');
    tableBody.innerHTML = '';

    if (history.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">暂无历史记录</td></tr>';
        return;
    }

    history.forEach((record, index) => {
        const row = document.createElement('tr');

        // 根据拥堵等级设置行样式
        if (record.congestionLevel.includes('严重拥堵')) {
            row.style.backgroundColor = '#ffdddd';
        } else if (record.congestionLevel.includes('3度拥堵')) {
            row.style.backgroundColor = '#ffe6e6';
        } else if (record.congestionLevel.includes('2度拥堵')) {
            row.style.backgroundColor = '#fff0f0';
        } else if (record.congestionLevel.includes('1度拥堵')) {
            row.style.backgroundColor = '#fff5f5';
        }

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${record.timestamp}</td>
            <td>${record.videoName}</td>
            <td>${record.totalVehicles}</td>
            <td>${record.congestionIndex}</td>
            <td>${record.congestionLevel}</td>
            <td>${record.congestionAlerts}</td>
            <td>
                <button class="action-btn view-btn" onclick="viewRecordDetails(${record.id})">查看</button>
                <button class="action-btn delete-btn" onclick="deleteRecord(${record.id})">删除</button>
            </td>
        `;

        tableBody.appendChild(row);
    });
}

// 查看记录详情
function viewRecordDetails(recordId) {
    const history = getDetectionHistory();
    const record = history.find(r => r.id === recordId);

    if (!record) return;

    // 创建一个详情弹窗
    const detailHtml = `
        <div class="detail-modal">
            <h3>检测记录详情 - ${record.videoName}</h3>
            <p><strong>检测时间:</strong> ${record.timestamp}</p>
            
            <div class="detail-section">
                <h4>车辆统计</h4>
                <p>总车辆数: ${record.totalVehicles}</p>
                <p>识别成功: ${record.detectedVehicles}</p>
                <p>识别失败: ${record.failedVehicles}</p>
            </div>
            
            <div class="detail-section">
                <h4>拥堵情况</h4>
                <p>拥堵指数: ${record.congestionIndex}</p>
                <p>拥堵等级: ${record.congestionLevel}</p>
                <p>拥堵报警次数: ${record.congestionAlerts}</p>
            </div>
            
            <div class="detail-section">
                <h4>车辆分类</h4>
                <p>轿车: ${record.fullData.vehicle_counts?.car || 0}</p>
                <p>卡车: ${(record.fullData.vehicle_counts?.bigtruck || 0) + 
                          (record.fullData.vehicle_counts?.smalltruck || 0) + 
                          (record.fullData.vehicle_counts?.midtruck || 0)}</p>
                <p>公交车: ${(record.fullData.vehicle_counts?.bigbus || 0) + 
                            (record.fullData.vehicle_counts?.smallbus || 0)}</p>
            </div>
            
            <button onclick="closeDetailModal()" class="qa-button">关闭</button>
        </div>
    `;

    // 创建并显示详情弹窗
    const detailModal = document.createElement('div');
    detailModal.className = 'detail-modal-container';
    detailModal.innerHTML = detailHtml;
    document.body.appendChild(detailModal);

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .detail-modal-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1001;
        }
        .detail-modal {
            background: white;
            padding: 20px;
            border-radius: 8px;
            width: 80%;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
        }
        .detail-section {
            margin: 15px 0;
            padding: 10px;
            background: #f9f9f9;
            border-radius: 5px;
        }
    `;
    document.head.appendChild(style);
}

// 关闭详情弹窗
function closeDetailModal() {
    const modal = document.querySelector('.detail-modal-container');
    if (modal) {
        modal.remove();
    }
    // 同时移除样式
    const style = document.querySelector('style');
    if (style) {
        style.remove();
    }
}

// 删除记录
function deleteRecord(recordId) {
    if (confirm('确定要删除这条记录吗？')) {
        let history = getDetectionHistory();
        history = history.filter(r => r.id !== recordId);
        localStorage.setItem('detectionHistory', JSON.stringify(history));
        updateHistoryTable();
        updateSummaryStats();
    }
}


