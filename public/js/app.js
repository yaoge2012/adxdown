const DIFFICULTIES = ["全部", "Basic", "Advanced", "Expert", "Master", "ReMaster"];
const LEVELS = ["全部", "10", "11", "12", "13", "13+", "14", "14+"];

const state = { eras: {}, versions: [], currentVersion: null, charts: [],
  filters: { difficulty: "全部", level: "全部", search: "" },
  searchMode: false, searchResults: [] };

const main = document.getElementById("main");
const globalSearch = document.getElementById("global-search");
const aboutDialog = document.getElementById("about-dialog");

document.getElementById("about-btn").addEventListener("click", () => aboutDialog.showModal());
document.getElementById("close-about").addEventListener("click", () => aboutDialog.close());

globalSearch.addEventListener("input", debounce(async (e) => {
  const q = e.target.value.trim();
  if (!q) { state.searchMode = false; route(); return; }
  state.searchMode = true;
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  state.searchResults = data.charts;
  renderSearch(q);
}, 250));

window.addEventListener("hashchange", route);
window.addEventListener("load", async () => {
  await loadVersions();
  route();
});

async function loadVersions() {
  if (window.__INITIAL_DATA__) {
    state.eras = window.__INITIAL_DATA__.eras;
    state.versions = window.__INITIAL_DATA__.versions;
    return;
  }
  const res = await fetch("/api/versions");
  const data = await res.json();
  state.eras = data.eras;
  state.versions = data.versions;
}

function route() {
  if (state.versions.length > 0) {
    const hash = location.hash.slice(1) || "/";
    const parts = hash.split("/").filter(Boolean);
    if (parts[0] !== "version" || !parts[1]) {
      renderHome();
      return;
    }
  }
  state.searchMode = false;
  globalSearch.value = "";
  const hash = location.hash.slice(1) || "/";
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "version" && parts[1]) {
    loadBrowsePage(parts[1]);
  } else {
    renderHome();
  }
}

function renderHome() {
  const totalFolders = state.versions.length;
  const totalSongs = state.versions.reduce((s, v) => s + v.songCount, 0);
  const eras = ["dx", "cabinet"];
  main.innerHTML = `<h1 class="page-title">选择版本</h1>
<p class="page-desc">共 ${totalFolders} 个版本文件夹（含各代 PLUS），当前 ${totalSongs} 个谱面包。将文件放入对应文件夹即可自动收录。</p>
${eras.map((era) => {
  const list = state.versions.filter((v) => v.era === era);
  if (!list.length) return "";
  return `<section class="era-section"><div class="era-header"><h2>${escapeHtml(state.eras[era] || era)}</h2><span class="badge">${list.length} 个文件夹</span></div><div class="version-grid">${list.map((v) => versionCardHtml(v)).join("")}</div></section>`;
}).join("")}
<div class="info-card"><h3>如何添加谱面</h3><p>1. 将谱面文件（.zip / .adx / .rar 等）放入 <code>files/版本名</code> 文件夹</p><p>2. 文件名格式：<code>曲名_难度_定数.zip</code>（例：<code>夜咄ディセイブMaster_14+.zip</code>）</p><p>3. 或在文件夹内创建 <code>manifest.json</code> 填写详细元数据（参照 prism 文件夹示例）</p></div>`;
  main.querySelectorAll(".version-card").forEach((el) => {
    el.addEventListener("click", () => { location.hash = `#/version/${el.dataset.id}`; });
  });
}

function versionCardHtml(v) {
  return `<article class="version-card" data-id="${escapeHtml(v.id)}" style="--accent:${escapeHtml(v.accent)}">
<div class="version-card-top"><div class="version-accent" style="background:${escapeHtml(v.accent)}"></div><div><p class="version-name">${escapeHtml(v.name)}</p><p class="version-sub">${escapeHtml(v.subtitle)}</p></div></div>
<div class="version-footer"><div><div class="version-count">${v.songCount} 个谱面包</div><div class="version-folder">/files/${escapeHtml(v.folder)}/</div></div><span class="version-enter">进入 →</span></div></article>`;
}

async function loadBrowsePage(versionId) {
  const res = await fetch(`/api/charts/${encodeURIComponent(versionId)}`);
  if (!res.ok) { main.innerHTML = `<div class="empty-state">版本不存在</div>`; return; }
  const data = await res.json();
  state.currentVersion = data.version;
  state.charts = data.charts;
  state.filters = { difficulty: "全部", level: "全部", search: "" };
  renderBrowse();
}

function renderBrowse() {
  const v = state.currentVersion;
  const filtered = filterCharts(state.charts, state.filters);
  main.innerHTML = `<div class="browse-header">
<button type="button" class="btn btn-ghost" id="back-btn">← 返回</button>
<div class="version-accent" style="background:${escapeHtml(v.accent)};width:3px;height:20px;border-radius:2px"></div>
<div class="browse-title-wrap"><h2>${escapeHtml(v.name)}</h2><p class="browse-sub">${escapeHtml(v.subtitle)} · /files/${escapeHtml(v.folder)}/</p></div>
<div class="browse-stats"><div class="stat"><div class="stat-value">${filtered.length}</div><div class="stat-label">当前显示</div></div><div class="stat"><div class="stat-value">${state.charts.length}</div><div class="stat-label">版本总量</div></div></div></div>
<div class="filters"><div class="filter-row"><span class="filter-label">难度</span>${DIFFICULTIES.map(d => `<button type="button" class="btn btn-secondary filter-diff ${d === state.filters.difficulty ? "active" : ""}" data-value="${d}">${d}</button>`).join("")}</div>
<div class="filter-row"><span class="filter-label">定数</span>${LEVELS.map(l => `<button type="button" class="btn btn-secondary filter-level ${l === state.filters.level ? "active" : ""}" data-value="${l}">${l}</button>`).join("")}</div></div>
${filtered.length ? chartTableHtml(filtered, v.id) : `<div class="empty-state">暂无谱面。请将文件放入 files/${escapeHtml(v.folder)}/ 文件夹。</div>`}`;
  document.getElementById("back-btn").addEventListener("click", () => { location.hash = "#/"; });
  main.querySelectorAll(".filter-diff").forEach((btn) => { btn.addEventListener("click", () => { state.filters.difficulty = btn.dataset.value; renderBrowse(); }); });
  main.querySelectorAll(".filter-level").forEach((btn) => { btn.addEventListener("click", () => { state.filters.level = btn.dataset.value; renderBrowse(); }); });
  bindDownloadButtons();
}

function renderSearch(q) {
  main.innerHTML = `<h1 class="page-title">搜索结果</h1><p class="page-desc">关键词"${escapeHtml(q)}"，共${state.searchResults.length}条</p>
${state.searchResults.length ? chartTableHtml(state.searchResults, null, true) : `<div class="empty-state">未找到匹配的谱面</div>`}
<div style="margin-top:16px"><button type="button" class="btn btn-ghost" id="clear-search">清除搜索</button></div>`;
  document.getElementById("clear-search").addEventListener("click", () => { globalSearch.value = ""; state.searchMode = false; route(); });
  bindDownloadButtons();
}

function filterCharts(charts, filters) {
  return charts.filter((c) => {
    if (filters.difficulty !== "全部" && c.difficulty !== filters.difficulty) return false;
    if (filters.level !== "全部" && c.level !== filters.level) return false;
    return true;
  });
}

function chartTableHtml(charts, versionId, showVersion = false) {
  return `<div class="chart-table-wrap"><table class="chart-table"><thead><tr>
<th>曲名</th><th>艺术家</th><th>谱师</th>${showVersion ? "<th>版本</th>" : ""}
<th class="col-center">DX</th><th class="col-center">难度</th><th class="col-center">定数</th><th class="col-right">大小</th><th class="col-center">操作</th>
</tr></thead><tbody>${charts.map((c) => {
  const vid = versionId || c.versionId;
  return `<tr>
<td><strong>${escapeHtml(c.title)}</strong></td>
<td style="color:var(--text-secondary);font-size:12px">${escapeHtml(c.artist || "-")}</td>
<td style="color:var(--text-secondary);font-size:12px">${escapeHtml(c.charter || "-")}</td>
${showVersion ? `<td><span class="search-result-meta">${escapeHtml(c.versionName)}</span></td>` : ""}
<td class="col-center">${dxStarsHtml(c.dxLevel)}</td>
<td class="col-center">${c.difficulty ? `<span class="pill">${escapeHtml(c.difficulty)}</span>` : "-"}</td>
<td class="col-center">${c.level ? `<strong>${escapeHtml(c.level)}</strong>` : "-"}</td>
<td class="col-right" style="color:var(--text-tertiary);font-size:12px">${escapeHtml(c.size)}</td>
<td class="col-center"><button type="button" class="btn btn-primary btn-dl" data-version="${escapeHtml(vid)}" data-file="${escapeHtml(c.file)}">下载</button></td>
</tr>`;
}).join("")}</tbody></table></div>`;
}

function dxStarsHtml(count) {
  if (!count) return '<span class="dx-stars">-</span>';
  let html = '<span class="dx-stars">';
  for (let i = 0; i < 5; i++) { html += `<span class="${i < count ? "on" : ""}">★</span>`; }
  return html + "</span>";
}

function bindDownloadButtons() {
  main.querySelectorAll(".btn-dl").forEach((btn) => { btn.addEventListener("click", () => downloadFile(btn)); });
}

function downloadFile(btn) {
  const version = btn.dataset.version;
  const file = btn.dataset.file;
  const url = `/download/${encodeURIComponent(version)}/${encodeURIComponent(file)}`;
  btn.disabled = true;
  btn.textContent = "下载中…";
  const a = document.createElement("a");
  a.href = url; a.download = file;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = "已下载";
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-downloaded");
  }, 800);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
