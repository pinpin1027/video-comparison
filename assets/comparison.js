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
const notesList = document.querySelector("#notes-list");
const settingsList = document.querySelector("#settings-list");
const sourceLinks = document.querySelector("#source-links");

let manifest;
let activeCase;
let wantsPlayback = false;
let draggingTimeline = false;
let syncFrame = 0;

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00.0";
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remainder}`;
}

function metaText(meta) {
  const fps = Number(meta.fps).toFixed(Number(meta.fps) % 1 ? 2 : 0);
  return `${meta.width}×${meta.height} · ${fps} fps · ${meta.frames} 帧 · ${Number(meta.duration).toFixed(3)} 秒`;
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
  if (event.target.closest(".controls")) return;
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
  return beforeVideo.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && afterVideo.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
}

function showMessage(message) {
  stageMessage.textContent = message;
  stageMessage.hidden = false;
}

function hideMessage() {
  stageMessage.hidden = true;
}

async function startPlayback() {
  wantsPlayback = true;
  if (!videosReady()) {
    showMessage("正在等待两侧视频缓冲…");
    return;
  }
  hideMessage();
  const anchor = beforeVideo.currentTime;
  afterVideo.currentTime = anchor;
  try {
    await Promise.all([beforeVideo.play(), afterVideo.play()]);
    playButton.textContent = "暂停";
    cancelAnimationFrame(syncFrame);
    syncFrame = requestAnimationFrame(syncVideos);
  } catch (error) {
    wantsPlayback = false;
    showMessage(`浏览器阻止播放：${error.message}`);
  }
}

function pausePlayback({ preserveIntent = false } = {}) {
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
    if (wantsPlayback) {
      pausePlayback({ preserveIntent: true });
      showMessage("一侧正在缓冲，已同步暂停两侧视频…");
    }
  });
  video.addEventListener("stalled", () => {
    if (wantsPlayback) showMessage("网络读取较慢，正在等待两侧视频…");
  });
  video.addEventListener("canplay", () => {
    if (wantsPlayback && videosReady()) startPlayback();
  });
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
  activeCase = selected;
  pausePlayback();
  beforeVideo.src = selected.left;
  afterVideo.src = selected.right;
  beforeVideo.load();
  afterVideo.load();
  timeline.value = "0";
  timeline.max = String(Math.max(selected.leftMeta.duration, selected.rightMeta.duration));
  leftMeta.innerHTML = `<strong>${manifest.leftLabel}</strong><span>${metaText(selected.leftMeta)}</span>`;
  rightMeta.innerHTML = `<strong>${manifest.rightLabel}</strong><span>${metaText(selected.rightMeta)}</span>`;
  caseSelect.value = selected.id;
  showMessage("视频已切换，点击播放开始同步对比。拖动中线查看左右差异。");
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("case", selected.id);
    history.replaceState(null, "", url);
  }
}

caseSelect.addEventListener("change", () => applyCase(caseSelect.value));

function renderList(target, items) {
  target.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

async function initialize() {
  try {
    const response = await fetch("manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
    document.title = `${manifest.title} · Video Comparison`;
    document.querySelector("#experiment-title").textContent = manifest.title;
    document.querySelector("#experiment-description").textContent = manifest.description;
    leftStageLabel.textContent = manifest.leftLabel;
    rightStageLabel.textContent = manifest.rightLabel;
    renderList(notesList, manifest.notes || []);
    renderList(settingsList, manifest.settings || []);
    sourceLinks.innerHTML = (manifest.links || []).map((link) => `<a href="${link.url}" target="_blank" rel="noreferrer">${link.label} ↗</a>`).join("");
    caseSelect.innerHTML = manifest.cases.map((item) => `<option value="${item.id}">${item.title}</option>`).join("");
    const requested = new URLSearchParams(location.search).get("case");
    applyCase(requested, false);
  } catch (error) {
    showMessage(`实验清单加载失败：${error.message}`);
    playButton.disabled = true;
    caseSelect.disabled = true;
  }
}

setSplit(50);
initialize();
