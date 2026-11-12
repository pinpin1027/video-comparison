const stage = document.querySelector("#video-stage");
const beforeVideo = document.querySelector("#before-video");
const afterVideo = document.querySelector("#after-video");
const splitHandle = document.querySelector("#split-handle");
const playButton = document.querySelector("#play-button");
const timeline = document.querySelector("#timeline");
const timeLabel = document.querySelector("#time-label");
const muteButton = document.querySelector("#mute-button");
const caseSelect = document.querySelector("#case-select");
const leftStageLabel = document.querySelector("#left-stage-label");
const rightStageLabel = document.querySelector("#right-stage-label");
const leftMeta = document.querySelector("#left-meta");
const rightMeta = document.querySelector("#right-meta");
const stageMessage = document.querySelector("#stage-message");
const subexperimentGrid = document.querySelector("#subexperiment-grid");
const readyContent = document.querySelector("#ready-experiment-content");
const pendingContent = document.querySelector("#pending-experiment-content");
const pendingTitle = document.querySelector("#pending-title");
const pendingDescription = document.querySelector("#pending-description");
const experimentKicker = document.querySelector("#experiment-kicker");

let manifest;
let collection;
let selectedExperiment;
let wantsPlayback = false;
let draggingTimeline = false;
let syncFrame = 0;
let playAttempt = 0;
let playStarting = false;
let resumeTimer = 0;

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00.0";
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remainder}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(Number(bytes))) return "";
  const megabytes = Number(bytes) / (1024 * 1024);
  return `${megabytes.toFixed(megabytes >= 10 ? 1 : 2)} MB`;
}

function metaText(meta) {
  const fps = Number(meta.fps).toFixed(Number(meta.fps) % 1 ? 2 : 0);
  return `${meta.width}×${meta.height} · ${fps} fps · ${meta.frames} 帧 · ${Number(meta.duration).toFixed(3)} 秒 · 网页版 ${formatBytes(meta.size)}`;
}

function metaMarkup(label, meta, originalUrl) {
  const download = originalUrl
    ? `<a class="original-download" href="${originalUrl}" download>下载原始文件 <span>${formatBytes(meta.originalSize)}</span></a>`
    : "";
  return `<strong>${label}</strong><span class="meta-details">${metaText(meta)}</span>${download}`;
}

function setSplit(percent) {
  const value = Math.min(100, Math.max(0, percent));
  stage.style.setProperty("--split", `${value}%`);
  splitHandle.setAttribute("aria-valuenow", String(Math.round(value)));
}

function splitFromPointer(event) {
  const rect = stage.getBoundingClientRect();
  setSplit(((event.clientX - rect.left) / rect.width) * 100);
}

stage.addEventListener("pointerdown", (event) => {
  stage.setPointerCapture(event.pointerId);
  splitFromPointer(event);
});
stage.addEventListener("pointermove", (event) => {
  if (stage.hasPointerCapture(event.pointerId)) splitFromPointer(event);
});
splitHandle.addEventListener("keydown", (event) => {
  const current = Number(splitHandle.getAttribute("aria-valuenow") || 50);
  const step = event.shiftKey ? 10 : 2;
  if (event.key === "ArrowLeft") { event.preventDefault(); setSplit(current - step); }
  if (event.key === "ArrowRight") { event.preventDefault(); setSplit(current + step); }
  if (event.key === "Home") { event.preventDefault(); setSplit(0); }
  if (event.key === "End") { event.preventDefault(); setSplit(100); }
});

function videosReady() {
  return beforeVideo.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
    && afterVideo.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
}

function showMessage(message) {
  stageMessage.textContent = message;
  stageMessage.hidden = false;
}

function hideMessage() {
  stageMessage.hidden = true;
}

function scheduleResume() {
  clearTimeout(resumeTimer);
  if (!wantsPlayback) return;
  resumeTimer = window.setTimeout(() => {
    if (wantsPlayback && videosReady() && !playStarting && (beforeVideo.paused || afterVideo.paused)) {
      startPlayback();
    }
  }, 160);
}

async function startPlayback() {
  wantsPlayback = true;
  if (playStarting) return;
  if (!beforeVideo.paused && !afterVideo.paused) {
    playButton.textContent = "暂停";
    return;
  }
  if (!videosReady()) {
    showMessage("正在等待两侧视频缓冲…");
    scheduleResume();
    return;
  }

  clearTimeout(resumeTimer);
  const attempt = ++playAttempt;
  playStarting = true;
  hideMessage();
  afterVideo.currentTime = beforeVideo.currentTime;
  const results = await Promise.allSettled([beforeVideo.play(), afterVideo.play()]);

  if (attempt !== playAttempt) return;
  playStarting = false;
  const failure = results.find((result) => result.status === "rejected");
  if (failure) {
    const error = failure.reason;
    if (wantsPlayback && error?.name === "AbortError") {
      showMessage("一侧正在缓冲，已同步等待两侧视频…");
      scheduleResume();
      return;
    }
    wantsPlayback = false;
    playButton.textContent = "播放";
    showMessage(`无法播放：${error?.message || "未知浏览器错误"}`);
    return;
  }

  if (!wantsPlayback) return;
  playButton.textContent = "暂停";
  cancelAnimationFrame(syncFrame);
  syncFrame = requestAnimationFrame(syncVideos);
}

function pausePlayback({ preserveIntent = false } = {}) {
  playAttempt += 1;
  playStarting = false;
  clearTimeout(resumeTimer);
  beforeVideo.pause();
  afterVideo.pause();
  if (!preserveIntent) wantsPlayback = false;
  playButton.textContent = "播放";
  cancelAnimationFrame(syncFrame);
}

function syncVideos() {
  if (beforeVideo.paused || afterVideo.paused) return;
  if (Math.abs(beforeVideo.currentTime - afterVideo.currentTime) > 0.08) {
    afterVideo.currentTime = beforeVideo.currentTime;
  }
  updateTimeline();
  syncFrame = requestAnimationFrame(syncVideos);
}

function updateTimeline() {
  if (!draggingTimeline) timeline.value = String(beforeVideo.currentTime || 0);
  timeLabel.textContent = `${formatTime(beforeVideo.currentTime)} / ${formatTime(beforeVideo.duration)}`;
}

playButton.addEventListener("click", () => {
  if (wantsPlayback) pausePlayback(); else startPlayback();
});

timeline.addEventListener("pointerdown", () => { draggingTimeline = true; });
timeline.addEventListener("input", () => {
  const time = Number(timeline.value);
  beforeVideo.currentTime = time;
  afterVideo.currentTime = time;
  updateTimeline();
});
timeline.addEventListener("change", () => { draggingTimeline = false; });
timeline.addEventListener("pointerup", () => { draggingTimeline = false; });

muteButton.addEventListener("click", () => {
  const nextMuted = !beforeVideo.muted;
  beforeVideo.muted = nextMuted;
  afterVideo.muted = nextMuted;
  muteButton.textContent = nextMuted ? "开启声音" : "静音";
});

for (const video of [beforeVideo, afterVideo]) {
  video.addEventListener("waiting", () => {
    if (!wantsPlayback) return;
    pausePlayback({ preserveIntent: true });
    showMessage("一侧正在缓冲，已同步暂停两侧视频…");
    scheduleResume();
  });
  video.addEventListener("stalled", () => {
    if (wantsPlayback) showMessage("网络读取较慢，正在等待两侧视频…");
  });
  video.addEventListener("canplay", scheduleResume);
  video.addEventListener("timeupdate", updateTimeline);
  video.addEventListener("error", () => showMessage("视频加载失败，请刷新页面或检查网络。"));
}

beforeVideo.addEventListener("loadedmetadata", () => {
  timeline.max = String(Math.min(beforeVideo.duration || 0, afterVideo.duration || Infinity));
  updateTimeline();
});
afterVideo.addEventListener("loadedmetadata", () => {
  timeline.max = String(Math.min(beforeVideo.duration || Infinity, afterVideo.duration || 0));
  updateTimeline();
});

function applyCase(caseId, updateUrl = true) {
  const selected = manifest.cases.find((item) => item.id === caseId) || manifest.cases[0];
  pausePlayback();
  beforeVideo.src = selected.left;
  afterVideo.src = selected.right;
  beforeVideo.load();
  afterVideo.load();
  timeline.value = "0";
  timeline.max = String(Math.max(selected.leftMeta.duration, selected.rightMeta.duration));
  leftMeta.innerHTML = metaMarkup(manifest.leftLabel, selected.leftMeta, selected.leftOriginal);
  rightMeta.innerHTML = metaMarkup(manifest.rightLabel, selected.rightMeta, selected.rightOriginal);
  caseSelect.value = selected.id;
  showMessage("点击播放开始同步对比；拖动中线查看左右差异。");
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("case", selected.id);
    history.replaceState(null, "", url);
  }
}

caseSelect.addEventListener("change", () => applyCase(caseSelect.value));

async function loadManifest(url, experiment) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  manifest = await response.json();
  document.title = collection
    ? `${manifest.title} · Open-H3-IC`
    : `${manifest.title} · Video Comparison`;
  document.querySelector("#experiment-title").textContent = manifest.title;
  document.querySelector("#experiment-description").textContent = manifest.description;
  if (experimentKicker && experiment) experimentKicker.textContent = `${experiment.title} · VIDEO COMPARISON`;
  leftStageLabel.textContent = manifest.leftLabel;
  rightStageLabel.textContent = manifest.rightLabel;
  caseSelect.innerHTML = manifest.cases.map((item) => `<option value="${item.id}">${item.title}</option>`).join("");
  if (readyContent) readyContent.hidden = false;
  if (pendingContent) pendingContent.hidden = true;
  const requested = new URLSearchParams(location.search).get("case");
  applyCase(requested, false);
}

function setSelectedButton(id) {
  document.querySelectorAll(".subexperiment-card").forEach((button) => {
    const selected = button.dataset.experimentId === id;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

async function selectExperiment(id, updateUrl = true) {
  const experiment = collection.experiments.find((item) => item.id === id) || collection.experiments[0];
  selectedExperiment = experiment;
  setSelectedButton(experiment.id);
  pausePlayback();

  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("experiment", experiment.id);
    url.searchParams.delete("case");
    history.replaceState(null, "", url);
  }

  if (experiment.status !== "ready" || !experiment.manifest) {
    readyContent.hidden = true;
    pendingContent.hidden = false;
    pendingTitle.textContent = `${experiment.title}：${experiment.subtitle}`;
    pendingDescription.textContent = experiment.summary;
    document.title = `${experiment.title} · Open-H3-IC`;
    return;
  }

  readyContent.hidden = true;
  pendingContent.hidden = true;
  await loadManifest(experiment.manifest, experiment);
}

function renderSubexperiments() {
  subexperimentGrid.innerHTML = "";
  for (const experiment of collection.experiments) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "subexperiment-card";
    button.dataset.experimentId = experiment.id;
    button.setAttribute("aria-pressed", "false");

    const top = document.createElement("span");
    top.className = "subexperiment-card-top";
    const index = document.createElement("span");
    index.textContent = experiment.index;
    const status = document.createElement("span");
    status.className = experiment.status === "ready" ? "status-ready" : "status-pending";
    status.textContent = experiment.status === "ready" ? "已上线" : "案例待添加";
    top.append(index, status);

    const title = document.createElement("strong");
    title.textContent = experiment.title;
    const subtitle = document.createElement("span");
    subtitle.className = "subexperiment-subtitle";
    subtitle.textContent = experiment.subtitle;
    const summary = document.createElement("span");
    summary.className = "subexperiment-summary";
    summary.textContent = experiment.summary;
    button.append(top, title, subtitle, summary);
    button.addEventListener("click", () => selectExperiment(experiment.id));
    subexperimentGrid.append(button);
  }
}

async function initialize() {
  try {
    if (!subexperimentGrid) {
      await loadManifest("manifest.json", null);
      return;
    }
    const response = await fetch("collection.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    collection = await response.json();
    renderSubexperiments();
    const requested = new URLSearchParams(location.search).get("experiment");
    await selectExperiment(requested, false);
  } catch (error) {
    if (readyContent) readyContent.hidden = false;
    showMessage(`实验清单加载失败：${error.message}`);
    playButton.disabled = true;
    caseSelect.disabled = true;
  }
}

setSplit(50);
initialize();
