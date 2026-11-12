const grid = document.querySelector("#experiment-grid");
const experimentCount = document.querySelector("#experiment-count");
const caseCount = document.querySelector("#case-count");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadDirectory() {
  try {
    const response = await fetch("experiments.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const experiments = Array.isArray(payload.experiments) ? payload.experiments : [];

    experimentCount.textContent = String(experiments.length);
    caseCount.textContent = String(experiments.reduce((sum, item) => sum + Number(item.caseCount || 0), 0));

    if (!experiments.length) {
      grid.innerHTML = '<p class="loading-message">还没有实验页面。</p>';
      return;
    }

    grid.innerHTML = experiments.map((item, index) => `
      <a class="experiment-card" href="${escapeHtml(item.href)}">
        <div class="card-top">
          <span class="card-index">EXP ${String(index + 1).padStart(2, "0")}</span>
          <span class="card-count">${Number(item.caseCount || 0)} 组案例 · ${escapeHtml(item.updated || "")}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        <div class="card-footer">
          <span>${escapeHtml(item.leftLabel)} × ${escapeHtml(item.rightLabel)}</span>
          <span class="card-arrow" aria-hidden="true">↗</span>
        </div>
      </a>
    `).join("");
  } catch (error) {
    experimentCount.textContent = "0";
    caseCount.textContent = "0";
    grid.innerHTML = `<p class="error-message">实验目录加载失败：${escapeHtml(error.message)}</p>`;
  }
}

loadDirectory();
