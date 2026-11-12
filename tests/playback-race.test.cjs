const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const useHead = process.argv.includes("--head");
const source = useHead
  ? execFileSync("git", ["show", "HEAD:assets/comparison.js"], { cwd: root, encoding: "utf8" })
  : fs.readFileSync(path.join(root, "assets", "comparison.js"), "utf8");

class FakeElement {
  constructor() {
    this.listeners = new Map();
    this.attributes = new Map();
    this.style = { setProperty() {} };
    this.classList = { toggle() {} };
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
  }

  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) || [];
    callbacks.push(callback);
    this.listeners.set(name, callbacks);
  }

  dispatch(name) {
    for (const callback of this.listeners.get(name) || []) callback({ type: name, target: this });
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  setPointerCapture() {}
  hasPointerCapture() { return false; }
  getBoundingClientRect() { return { left: 0, width: 1000 }; }
  append() {}
}

class FakeVideo extends FakeElement {
  constructor() {
    super();
    this.readyState = 3;
    this.paused = true;
    this.currentTime = 0;
    this.duration = 5;
    this.muted = true;
    this.abortOnPlay = false;
  }

  play() {
    this.paused = false;
    if (this.abortOnPlay) {
      this.dispatch("waiting");
      const error = new Error("The play() request was interrupted by a call to pause().");
      error.name = "AbortError";
      return Promise.reject(error);
    }
    return Promise.resolve();
  }

  pause() { this.paused = true; }
  load() {}
}

const beforeVideo = new FakeVideo();
const afterVideo = new FakeVideo();
const elements = new Map([
  ["#video-stage", new FakeElement()],
  ["#before-video", beforeVideo],
  ["#after-video", afterVideo],
  ["#split-handle", new FakeElement()],
  ["#play-button", new FakeElement()],
  ["#timeline", new FakeElement()],
  ["#time-label", new FakeElement()],
  ["#mute-button", new FakeElement()],
  ["#case-select", new FakeElement()],
  ["#left-stage-label", new FakeElement()],
  ["#right-stage-label", new FakeElement()],
  ["#left-meta", new FakeElement()],
  ["#right-meta", new FakeElement()],
  ["#stage-message", new FakeElement()],
  ["#experiment-title", new FakeElement()],
  ["#experiment-description", new FakeElement()],
]);

const context = vm.createContext({
  console,
  document: {
    querySelector: (selector) => elements.get(selector) || null,
    querySelectorAll: () => [],
    createElement: () => new FakeElement(),
  },
  window: {
    location: { href: "http://localhost/experiment/" },
    setTimeout: () => 1,
  },
  location: { search: "" },
  history: { replaceState() {} },
  HTMLMediaElement: { HAVE_FUTURE_DATA: 3 },
  URL,
  URLSearchParams,
  clearTimeout() {},
  requestAnimationFrame: () => 1,
  cancelAnimationFrame() {},
  fetch: () => new Promise(() => {}),
});

vm.runInContext(source, context, { filename: useHead ? "HEAD:comparison.js" : "comparison.js" });
beforeVideo.abortOnPlay = true;

(async () => {
  await context.startPlayback();
  await new Promise((resolve) => setImmediate(resolve));
  const message = elements.get("#stage-message").textContent;
  assert.doesNotMatch(message, /浏览器阻止播放|无法播放|play\(\) request was interrupted/);
  assert.match(message, /缓冲|等待/);
  console.log(`playback race handled: ${message}`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
