const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { execFileSync } = require("child_process");

// 基本异常保护，防止意外崩溃
process.on("uncaughtException", (err) => {
  console.error("[ERROR] Uncaught:", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("[ERROR] Unhandled Rejection:", reason);
});

const ROOT = __dirname;
const FILES_DIR = path.join(ROOT, "files");
const PUBLIC_DIR = path.join(ROOT, "public");
function getVersions() {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, "data", "versions.json"), "utf8"),
  );
}

const ERA_LABELS = {
  dx: "でらっくす时代",
  cabinet: "初代舞萌（街机旧版）",
};

const DIFFICULTY_MAP = { "2": "Basic", "3": "Advanced", "4": "Expert", "5": "Master", "6": "ReMaster" };

const CHART_EXTENSIONS = new Set([
  ".zip",
  ".adx",
  ".rar",
  ".7z",
  ".ma2",
  ".txt",
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const PORT = process.env.PORT || 3000;
// 外部存储地址（NAS / WebDAV）。设置后下载会重定向到外部地址，不从本地 files 读取
const EXTERNAL_DOWNLOAD_URL = process.env.EXTERNAL_DOWNLOAD_URL || "";

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseMaidataJson(data) {
  const title = data.title || "";
  const artist = data.artist || "";
  const charts = [];
  for (let i = 2; i <= 6; i++) {
    const lv = data["lv_" + i];
    if (lv !== undefined && lv !== "") {
      charts.push({
        difficulty: DIFFICULTY_MAP[String(i)] || "",
        level: lv,
        charter: data["des_" + i] || data.des || "",
      });
    }
  }
  return { title, artist, charts };
}

function readZipMaidata(zipPath) {
  const scriptPath = path.join(__dirname, "scripts", "parse_maidata.py");
  try {
    const out = execFileSync("python", [scriptPath, zipPath], {
      encoding: "utf-8",
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
    return JSON.parse(out.trim());
  } catch (e) {
    return {};
  }
}

function safeBasename(name) {
  const base = path.basename(name);
  if (base !== name || base.includes("..")) return null;
  return base;
}

function getVersionById(id) {
  return getVersions().find((v) => v.id === id || v.folder === id);
}

function parseFilenameMeta(filename) {
  const base = path.parse(filename).name;
  const parts = base.split("_");
  if (parts.length >= 3) {
    const level = parts[parts.length - 1];
    const difficulty = parts[parts.length - 2];
    const title = parts.slice(0, -2).join("_");
    return { title, difficulty, level };
  }
  return { title: base, difficulty: "", level: "" };
}

function readManifest(folderPath) {
  const manifestPath = path.join(folderPath, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function scanVersionCharts(version) {
  const folderPath = path.join(FILES_DIR, version.folder);
  if (!fs.existsSync(folderPath)) {
    return [];
  }

  const manifest = readManifest(folderPath);
  const manifestMap = new Map();
  if (manifest) {
    for (const entry of manifest) {
      if (entry.file) manifestMap.set(entry.file, entry);
    }
  }

  // 尝试读取 maidata.json 缓存（由 scripts/generate_metadata.py 生成）
  const maidataCachePath = path.join(folderPath, "maidata.json");
  let maidataCache = null;
  if (fs.existsSync(maidataCachePath)) {
    try {
      maidataCache = JSON.parse(fs.readFileSync(maidataCachePath, "utf8"));
    } catch (e) {
      console.warn("读取 maidata.json 缓存失败:", e.message);
    }
  }

  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const charts = [];
  // 远程模式（NAS）：若无本地谱面文件，直接从 maidata.json 生成歌曲列表
  if (EXTERNAL_DOWNLOAD_URL && maidataCache) {
    const hasLocalFiles = entries.some(e =>
      e.isFile() && [".zip", ".adx"].includes(path.extname(e.name).toLowerCase())
    );
    if (!hasLocalFiles) {
      for (const [fileName, data] of Object.entries(maidataCache)) {
        const parsed = data.charts ? data : parseMaidataJson(data);
        const meta = (manifestMap.get(fileName)) || {};
        for (const ci of parsed.charts) {
          charts.push({
            id: version.id + "/" + fileName + "_" + ci.difficulty,
            file: fileName,
            title: parsed.title,
            artist: parsed.artist || "",
            charter: ci.charter || meta.charter || "",
            difficulty: ci.difficulty,
            level: ci.level,
            dxLevel: 0,
            size: "—",
            sizeBytes: 0,
            versionId: version.id,
            versionName: version.name,
            folder: version.folder,
          });
        }
      }
      charts.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
      return charts;
    }
  }
  const maidataHandled = new Set();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (ext !== ".zip" && ext !== ".adx") continue;
    const filePath = path.join(folderPath, entry.name);
    // 优先使用 maidata.json 缓存（由 generate_metadata.py 生成），失败再运行时解析
    let maidata;
    if (maidataCache && maidataCache[entry.name]) {
      maidata = maidataCache[entry.name];
    } else {
      maidata = readZipMaidata(filePath);
    }
    if (maidata && maidata.title) {
      maidataHandled.add(entry.name);
      const parsed = maidata.charts ? maidata : parseMaidataJson(maidata);
      const stat = fs.statSync(filePath);
      for (const ci of parsed.charts) {
        charts.push({
          id: version.id + "/" + entry.name + "_" + ci.difficulty,
          file: entry.name,
          title: parsed.title,
          artist: parsed.artist || "",
          charter: ci.charter || "",
          difficulty: ci.difficulty,
          level: ci.level,
          dxLevel: 0,
          size: formatSize(stat.size),
          sizeBytes: stat.size,
          versionId: version.id,
          versionName: version.name,
          folder: version.folder,
        });
      }
    }
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === "manifest.json" || entry.name.startsWith(".")) continue;
    if (maidataHandled.has(entry.name)) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!CHART_EXTENSIONS.has(ext)) continue;

    const filePath = path.join(folderPath, entry.name);
    const stat = fs.statSync(filePath);
    const meta = manifestMap.get(entry.name) || {};
    const parsed = parseFilenameMeta(entry.name);

    charts.push({
      id: `${version.id}/${entry.name}`,
      file: entry.name,
      title: meta.title || parsed.title,
      artist: meta.artist || "",
      charter: meta.charter || "",
      difficulty: meta.difficulty || parsed.difficulty || "",
      level: meta.level || parsed.level || "",
      dxLevel: meta.dxLevel ?? (version.era === "dx" ? 0 : 0),
      size: formatSize(stat.size),
      sizeBytes: stat.size,
      versionId: version.id,
      versionName: version.name,
      folder: version.folder,
    });
  }

  charts.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
  return charts;
}

function getAllCharts() {
  const all = [];
  for (const version of getVersions()) {
    all.push(...scanVersionCharts(version));
  }
  return all;
}

function serveStatic(req, res, filePath) {
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function handleDownload(req, res, versionId, filename) {
  const safeName = safeBasename(filename);
  if (!safeName) {
    res.writeHead(400);
    res.end("Invalid filename");
    return;
  }

  const version = getVersionById(versionId);
  if (!version) {
    res.writeHead(404);
    res.end("Version not found");
    return;
  }

  // 如果设置了外部下载地址，重定向到 NAS / WebDAV
  if (EXTERNAL_DOWNLOAD_URL) {
    const externalUrl = `${EXTERNAL_DOWNLOAD_URL.replace(/\/+$/, "")}/${version.folder}/${encodeURIComponent(safeName)}`;
    console.log("[DOWNLOAD] Redirecting to:", externalUrl);
    res.writeHead(302, { Location: externalUrl });
    res.end();
    return;
  }
  
  const filePath = path.join(FILES_DIR, version.folder, safeName);
  const resolved = path.resolve(filePath);
  const allowedRoot = path.resolve(path.join(FILES_DIR, version.folder));

  if (!resolved.startsWith(allowedRoot + path.sep) && resolved !== allowedRoot) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    res.writeHead(404);
    res.end("File not found");
    return;
  }

  const stat = fs.statSync(resolved);
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    "Content-Length": stat.size,
  });
  fs.createReadStream(resolved).pipe(res);
}

const server = http.createServer((req, res) => {
  let url, pathname;
  try {
    url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    pathname = decodeURIComponent(url.pathname);
  } catch (e) {
    console.error("[ERROR] Bad request:", req.url, e.message);
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  if (pathname === "/api/versions") {
    const versions = getVersions().map((v) => ({
      ...v,
      songCount: countVersionFiles(v),
    }));
    return sendJson(res, 200, { eras: ERA_LABELS, versions });
  }

  if (pathname.startsWith("/api/charts/")) {
    const versionId = pathname.slice("/api/charts/".length);
    const version = getVersionById(versionId);
    if (!version) return sendJson(res, 404, { error: "Version not found" });
    return sendJson(res, 200, { version, charts: scanVersionCharts(version) });
  }

  if (pathname === "/api/search") {
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    let charts = getAllCharts();
    if (q) {
      charts = charts.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.artist.toLowerCase().includes(q) ||
          c.charter.toLowerCase().includes(q) ||
          c.file.toLowerCase().includes(q) ||
          c.versionName.toLowerCase().includes(q),
      );
    }
    return sendJson(res, 200, { charts });
  }

  if (pathname.startsWith("/download/")) {
    const parts = pathname.slice("/download/".length).split("/");
    if (parts.length === 2) {
      return handleDownload(req, res, parts[0], parts[1]);
    }
    res.writeHead(400);
    return res.end("Bad request");
  }

  let staticPath;
  if (pathname === "/" || pathname === "/index.html") {
    // 注入初始数据到 HTML，避免浏览器 fetch 问题
    const html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
    const versionsData = getVersions().map((v) => ({
      ...v,
      songCount: countVersionFiles(v),
    }));
    const injectScript = `<script>window.__INITIAL_DATA__=${JSON.stringify({eras:ERA_LABELS,versions:versionsData})};<\/script>`;
    const modified = html.replace('</head>', injectScript + '</head>');
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": Buffer.byteLength(modified) });
    res.end(modified);
    return;
  } else if (pathname.startsWith("/css/") || pathname.startsWith("/js/")) {
    staticPath = path.join(PUBLIC_DIR, pathname);
  } else {
    staticPath = path.join(PUBLIC_DIR, "index.html");
  }

  serveStatic(req, res, staticPath);
});

function ensureVersionFolders() {
  if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });
  for (const v of getVersions()) {
    const dir = path.join(FILES_DIR, v.folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

ensureVersionFolders();

server.on("error", (err) => {
  console.error("[SERVER FATAL]", err.code, err.message);
});

server.listen(PORT, () => {
  console.log(`ADX Download 运行在 http://localhost:${PORT}`);
  console.log(`谱面目录: ${FILES_DIR}`);
});
// 健康检查：每10秒输出服务器监听状态
setInterval(() => {
  const addr = server.address();
  console.log("[HEALTH] listening:", addr ? `${addr.address}:${addr.port}` : "NO");
}, 10000);
// 轻量文件计数：只统计文件夹内 .zip/.adx 文件数量，不解析内容
function countVersionFiles(version) {
  const folderPath = path.join(FILES_DIR, version.folder);
  if (!fs.existsSync(folderPath)) return 0;
  try {
    const entries = fs.readdirSync(folderPath);
    // 远程模式：没有本地谱面文件时从 maidata.json 统计
    const hasLocalFiles = entries.some(name =>
      [".zip", ".adx"].includes(path.extname(name).toLowerCase())
    );
    if (!hasLocalFiles && EXTERNAL_DOWNLOAD_URL) {
      const maidataPath = path.join(folderPath, "maidata.json");
      if (fs.existsSync(maidataPath)) {
        const cache = JSON.parse(fs.readFileSync(maidataPath, "utf8"));
        return Object.keys(cache).length;
      }
      return 0;
    }
    return entries.filter((name) => {
      if (name.startsWith(".") || name === "manifest.json" || name === "maidata.json") return false;
      const ext = path.extname(name).toLowerCase();
      return ext === ".zip" || ext === ".adx";
    }).length;
  } catch {
    return 0;
  }
}
