// node mcp/server.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const HOST = "127.0.0.1";
const DEFAULT_PAGES_BASE = "https://chiraleo2000.github.io/Police-news-intel-kit";
const DATA_ROOT = path.resolve(path.dirname(filePathFromImportUrl(import.meta.url)), "../github-pages/data");
const DOWNLOADS_DIR = path.join(DATA_ROOT, "downloads");

function resolvePagesBase() {
  const raw = process.env.PAGES_BASE;
  const value = raw && raw.trim() ? raw.trim().replace(/\/+$/, "") : DEFAULT_PAGES_BASE;
  if (/ngrok/i.test(value)) {
    console.error("PAGES_BASE must not be an ngrok host; using the GitHub Pages default");
    return DEFAULT_PAGES_BASE;
  }
  return value;
}

const PAGES_BASE = resolvePagesBase();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CRIME_FILE_RE = /^\d{4}-\d{2}-\d{2}_crime\.json$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,160}$/;
const IMAGE_EXT = new Set([".png", ".webp", ".jpg", ".jpeg"]);
const NOTIFICATION = Symbol("notification");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Day files attached to a post. infographic.png is the blog image.
// Names containing the letters "graph" are still news files; only tool names are rejected.
const POST_DAY_FILES = [
  { suffix: "infographic.png", kind: "image" },
  { suffix: "infographic_line.png", kind: "image" },
  { suffix: "crime.pdf", kind: "pdf" },
  { suffix: "crime_line.pdf", kind: "pdf" },
];

const TOOLS = [
  {
    name: "list_posts",
    description:
      "List news posts. Each item has id, date, title, topic, agency, and a short excerpt (exec_blurb, or content sliced when there is no blurb). Optional date (YYYY-MM-DD), q (substring), and limit (default 20, maximum 50). Does not return full article bodies or the whole archive.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Archive date YYYY-MM-DD" },
        q: {
          type: "string",
          description: "Case-insensitive substring matched against id, title, topic, agency, summary, and content",
        },
        limit: {
          type: "integer",
          description: "Maximum posts to return. Default 20, maximum 50.",
          minimum: 1,
          maximum: 50,
          default: 20,
        },
      },
    },
  },
  {
    name: "get_post",
    description:
      "Return one news post by id for a reader: id, date, title, topic, agency, content, exec_blurb, analysis_notes, source_links, and stats. Attaches that day's infographic as image and any of the day's infographic or PDF files that exist under downloads/.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Post id, for example 20261102-drug-01" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_downloads",
    description:
      "List PDF and image files (png, webp, jpg, jpeg) in the downloads folder. Optional date (YYYY-MM-DD) parsed from the filename. Does not list JSON.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Keep files whose filename starts with this YYYY-MM-DD date" },
      },
    },
  },
];

const HANDLERS = {
  list_posts: listPosts,
  get_post: getPost,
  list_downloads: listDownloads,
};

let archiveCache = null;

function filePathFromImportUrl(importUrl) {
  const pathname = decodeURIComponent(new URL(importUrl).pathname);
  if (process.platform === "win32" && /^\/[A-Za-z]:/.test(pathname)) return pathname.slice(1);
  return pathname;
}

function resolvePort() {
  const raw = process.env.PORT;
  if (raw === undefined || raw === "") return 8787;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error("Invalid PORT, using 8787");
    return 8787;
  }
  return port;
}

function rpcError(code, message, httpStatus = 200) {
  const err = new Error(message);
  err.rpc = true;
  err.code = code;
  err.httpStatus = httpStatus;
  return err;
}

function asText(value) {
  return typeof value === "string" ? value : "";
}

function dateFromId(id) {
  const match = /^(\d{4})(\d{2})(\d{2})-/.exec(id);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function pickStats(stats) {
  const source = stats && typeof stats === "object" && !Array.isArray(stats) ? stats : {};
  const picked = {};
  for (const key of ["arrested", "suspects", "victims", "loss_thb", "seized_value_thb"]) {
    picked[key] = typeof source[key] === "number" ? source[key] : null;
  }
  return picked;
}

function pickPost(raw, fallbackDate) {
  const id = asText(raw.id);
  let date = "";
  if (DATE_RE.test(asText(raw._date))) date = raw._date;
  else if (DATE_RE.test(fallbackDate)) date = fallbackDate;
  else date = dateFromId(id);

  const title = asText(raw.title);
  const topic = asText(raw.topic);
  const agency = asText(raw.agency);
  const content = asText(raw.content);
  const execBlurb = asText(raw.exec_blurb);
  const analysisNotes = asText(raw.analysis_notes);

  return {
    id,
    date,
    title,
    topic,
    agency,
    content,
    exec_blurb: execBlurb,
    analysis_notes: analysisNotes,
    source_url: asText(raw.source_url),
    references: Array.isArray(raw.references) ? raw.references : [],
    corroborating_sources: Array.isArray(raw.corroborating_sources) ? raw.corroborating_sources : [],
    stats: pickStats(raw.stats),
    search: [id, title, topic, agency, execBlurb, content].join("\n").toLowerCase(),
  };
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function readNewsJson(filePath) {
  const resolved = path.resolve(filePath);
  const rel = path.relative(path.resolve(DATA_ROOT), resolved);
  const unsafe =
    !rel ||
    rel.startsWith("..") ||
    path.isAbsolute(rel) ||
    rel.includes("/") ||
    rel.includes("\\");
  const lower = rel.toLowerCase();
  const allowedName = lower === "feed.json" || lower === "manifest.json" || CRIME_FILE_RE.test(lower);
  if (unsafe || !allowedName || lower.includes("graph") || lower.endsWith(".svg")) {
    throw new Error("Refused data path");
  }
  return JSON.parse(stripBom(fs.readFileSync(resolved, "utf8")));
}

function loadPosts() {
  const feedPath = path.join(DATA_ROOT, "feed.json");
  if (fs.existsSync(feedPath) && fs.statSync(feedPath).isFile()) {
    const feed = readNewsJson(feedPath);
    const list = Array.isArray(feed.posts) ? feed.posts : [];
    return list.filter((item) => item && typeof item === "object").map((item) => pickPost(item, ""));
  }

  const manifestPath = path.join(DATA_ROOT, "manifest.json");
  if (!fs.existsSync(manifestPath)) return [];
  const manifest = readNewsJson(manifestPath);
  const days = Array.isArray(manifest.days) ? manifest.days : [];
  const posts = [];
  for (const day of days) {
    if (!day || typeof day !== "object" || typeof day.crime_file !== "string") continue;
    const name = day.crime_file;
    if (name !== path.basename(name) || !CRIME_FILE_RE.test(name)) continue;
    const filePath = path.join(DATA_ROOT, name);
    if (!fs.existsSync(filePath)) continue;
    const doc = readNewsJson(filePath);
    const docDate = asText(doc.date);
    const dayDate = asText(day.date);
    const date = DATE_RE.test(docDate) ? docDate : DATE_RE.test(dayDate) ? dayDate : "";
    const list = Array.isArray(doc.posts) ? doc.posts : [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      posts.push(pickPost(item, date));
    }
  }
  return posts;
}

function stampOf(filePath) {
  try {
    return String(fs.statSync(filePath).mtimeMs);
  } catch {
    return "missing";
  }
}

function archiveStamp() {
  const feedPath = path.join(DATA_ROOT, "feed.json");
  if (fs.existsSync(feedPath)) return `feed:${stampOf(feedPath)}`;
  const manifestPath = path.join(DATA_ROOT, "manifest.json");
  let stamp = `manifest:${stampOf(manifestPath)}`;
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = readNewsJson(manifestPath);
      const days = Array.isArray(manifest.days) ? manifest.days : [];
      for (const day of days) {
        if (!day || typeof day.crime_file !== "string" || !CRIME_FILE_RE.test(day.crime_file)) continue;
        stamp += `|${day.crime_file}:${stampOf(path.join(DATA_ROOT, day.crime_file))}`;
      }
    } catch {
      stamp += "|unread";
    }
  }
  return stamp;
}

function getArchive() {
  const stamp = archiveStamp();
  if (archiveCache && archiveCache.stamp === stamp) return archiveCache;
  const posts = loadPosts().filter((post) => post.id);
  const byId = new Map();
  for (const post of posts) {
    if (!byId.has(post.id)) byId.set(post.id, post);
  }
  archiveCache = { stamp, posts, byId };
  return archiveCache;
}

function postHref(date, id) {
  return `${PAGES_BASE}/#/${date}/${id}`;
}

function downloadFileUrl(filename) {
  return `${PAGES_BASE}/data/downloads/${filename}`;
}

function excerptOf(post) {
  const blurb = post.exec_blurb.trim();
  if (blurb) return blurb;
  const content = post.content.replace(/\s+/g, " ").trim();
  if (content.length <= 280) return content;
  return `${content.slice(0, 280).trimEnd()}…`;
}

function optionalDate(args) {
  if (!Object.prototype.hasOwnProperty.call(args, "date") || args.date == null || args.date === "") {
    return "";
  }
  if (typeof args.date !== "string" || !DATE_RE.test(args.date)) {
    throw rpcError(-32602, "date must be YYYY-MM-DD");
  }
  return args.date;
}

function optionalQuery(args) {
  if (!Object.prototype.hasOwnProperty.call(args, "q") || args.q == null || args.q === "") return "";
  if (typeof args.q !== "string") throw rpcError(-32602, "q must be a string");
  return args.q.trim().slice(0, 200).toLowerCase();
}

function optionalLimit(args) {
  if (!Object.prototype.hasOwnProperty.call(args, "limit") || args.limit == null || args.limit === "") {
    return 20;
  }
  const value =
    typeof args.limit === "number"
      ? args.limit
      : typeof args.limit === "string" && args.limit.trim() !== ""
        ? Number(args.limit)
        : Number.NaN;
  if (!Number.isFinite(value) || value < 1) throw rpcError(-32602, "limit must be a number >= 1");
  return Math.min(50, Math.floor(value));
}

function listPosts(args) {
  const date = optionalDate(args);
  const query = optionalQuery(args);
  const limit = optionalLimit(args);
  const matched = getArchive().posts.filter((post) => {
    if (date && post.date !== date) return false;
    if (query && !post.search.includes(query)) return false;
    return true;
  });
  return {
    posts: matched.slice(0, limit).map((post) => ({
      id: post.id,
      date: post.date,
      title: post.title,
      topic: post.topic,
      agency: post.agency,
      excerpt: excerptOf(post),
      href: postHref(post.date, post.id),
    })),
    matched: matched.length,
    limit,
  };
}

function sourceLinks(post) {
  const links = [];
  const seen = new Set();
  const add = (name, url) => {
    if (typeof url !== "string") return;
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    const label = typeof name === "string" && name.trim() ? name.trim() : "แหล่งหลัก";
    links.push({ name: label, url: trimmed });
  };
  for (const ref of post.references) {
    if (ref && typeof ref === "object") add(ref.name, ref.url);
  }
  add("แหล่งหลัก", post.source_url);
  for (const source of post.corroborating_sources) {
    if (source && typeof source === "object") add(source.name, source.url);
  }
  return links;
}

function isRegularFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function filesForDate(date) {
  if (!DATE_RE.test(date)) return [];
  const root = path.resolve(DOWNLOADS_DIR);
  const found = [];
  for (const spec of POST_DAY_FILES) {
    const filename = `${date}_${spec.suffix}`;
    const full = path.resolve(root, filename);
    const rel = path.relative(root, full);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) continue;
    if (!isRegularFile(full)) continue;
    found.push({
      path: `downloads/${filename}`,
      url: downloadFileUrl(filename),
      kind: spec.kind,
    });
  }
  return found;
}

function getPost(args) {
  if (!Object.prototype.hasOwnProperty.call(args, "id") || args.id == null || args.id === "") {
    throw rpcError(-32602, "id is required");
  }
  if (typeof args.id !== "string" || !ID_RE.test(args.id)) {
    throw rpcError(-32602, "invalid id");
  }
  const post = getArchive().byId.get(args.id);
  if (!post) throw rpcError(-32004, "Post not found");
  const downloads = filesForDate(post.date);
  const image = downloads.find((file) => file.kind === "image");
  return {
    id: post.id,
    date: post.date,
    title: post.title,
    topic: post.topic,
    agency: post.agency,
    content: post.content,
    exec_blurb: post.exec_blurb,
    analysis_notes: post.analysis_notes,
    source_links: sourceLinks(post),
    stats: post.stats,
    href: postHref(post.date, post.id),
    image: image ? image.url : null,
    downloads,
  };
}

function listDownloads(args) {
  const date = optionalDate(args);
  if (!fs.existsSync(DOWNLOADS_DIR)) return { downloads: [] };
  const entries = fs.readdirSync(DOWNLOADS_DIR, { withFileTypes: true });
  const downloads = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.includes("/") || entry.name.includes("\\") || entry.name.includes("..")) continue;
    const ext = path.extname(entry.name).toLowerCase();
    let kind = "";
    if (ext === ".pdf") kind = "pdf";
    else if (IMAGE_EXT.has(ext)) kind = "image";
    else continue;
    const match = /^(\d{4}-\d{2}-\d{2})_/.exec(entry.name);
    const fileDate = match ? match[1] : null;
    if (date && fileDate !== date) continue;
    downloads.push({
      path: `downloads/${entry.name}`,
      url: downloadFileUrl(entry.name),
      kind,
      date: fileDate,
    });
  }
  downloads.sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return a.path.localeCompare(b.path);
  });
  return { downloads };
}

function publicTools() {
  return TOOLS.filter((tool) => !tool.name.toLowerCase().includes("graph")).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

function normalizeArgs(raw) {
  if (raw == null) return {};
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw rpcError(-32602, "Invalid arguments");
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw rpcError(-32602, "Invalid arguments");
  }
  return value;
}

function unknownToolError(name) {
  const shown = typeof name === "string" && name.length <= 80 && !/[\r\n]/.test(name) ? `: ${name}` : "";
  return rpcError(-32602, `Unknown tool${shown}`);
}

function toolsCall(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw rpcError(-32602, "Invalid params");
  }
  const name = params.name;
  if (typeof name !== "string" || name.toLowerCase().includes("graph") || !HANDLERS[name]) {
    throw unknownToolError(name);
  }
  const payload = HANDLERS[name](normalizeArgs(params.arguments));
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

function initializeResult() {
  return {
    protocolVersion: "2025-03-26",
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "police-news", version: "1.0.0", homepage: PAGES_BASE },
    instructions: "Use list_posts, get_post, and list_downloads for news text and download files.",
  };
}

function dispatch(msg) {
  const method = msg.method;
  if (typeof method !== "string" || method.length === 0 || method.length > 128) {
    throw rpcError(-32600, "Invalid Request", 400);
  }
  if (method.toLowerCase().includes("graph")) throw rpcError(-32601, "Method not found");
  if (method.startsWith("notifications/") || !Object.prototype.hasOwnProperty.call(msg, "id")) {
    return NOTIFICATION;
  }
  if (method === "initialize") return initializeResult();
  if (method === "ping") return {};
  if (method === "tools/list") return { tools: publicTools() };
  if (method === "tools/call") return toolsCall(msg.params);
  throw rpcError(-32601, "Method not found");
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function reply(res, status, id, result, error) {
  const body = { jsonrpc: "2.0", id: id === undefined ? null : id };
  if (error) body.error = { code: error.code, message: error.message };
  else body.result = result;
  sendJson(res, status, body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(value);
    };
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        finish(rpcError(-32600, "Payload too large", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => finish(null, Buffer.concat(chunks).toString("utf8")));
    req.on("error", (err) => finish(err));
  });
}

async function handle(req, res) {
  const url = new URL(req.url || "/", `http://${HOST}`);
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(pathname === "/mcp" ? 204 : 404, CORS_HEADERS);
    res.end();
    return;
  }

  if (pathname !== "/mcp") {
    reply(res, 404, null, null, { code: -32601, message: "Not found" });
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { ...CORS_HEADERS, Allow: "POST, OPTIONS" });
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Method not allowed" },
    });
    res.end(payload);
    return;
  }

  let msg;
  try {
    const raw = stripBom(await readBody(req)).trim();
    if (!raw) throw rpcError(-32700, "Parse error", 400);
    msg = JSON.parse(raw);
  } catch (err) {
    const parseErr = err && err.rpc ? err : rpcError(-32700, "Parse error", 400);
    reply(res, parseErr.httpStatus || 400, null, null, parseErr);
    return;
  }

  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    reply(res, 400, null, null, { code: -32600, message: "Invalid Request" });
    return;
  }
  if (msg.jsonrpc !== undefined && msg.jsonrpc !== "2.0") {
    reply(res, 400, Object.prototype.hasOwnProperty.call(msg, "id") ? msg.id : null, null, {
      code: -32600,
      message: "Invalid Request",
    });
    return;
  }

  try {
    const result = dispatch(msg);
    if (result === NOTIFICATION) {
      res.writeHead(202, CORS_HEADERS);
      res.end();
      return;
    }
    reply(res, 200, msg.id, result);
  } catch (err) {
    if (err && err.rpc) {
      reply(res, err.httpStatus || 200, msg.id, null, err);
      return;
    }
    console.error(err);
    reply(res, 500, msg.id, null, { code: -32603, message: "Internal error" });
  }
}

const port = resolvePort();
const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (res.headersSent) return;
    reply(res, 500, null, null, { code: -32603, message: "Internal error" });
  });
});

server.on("error", (err) => {
  console.error(err.message);
  process.exitCode = 1;
});

server.listen(port, HOST, () => {
  const address = server.address();
  const listening = address && typeof address === "object" ? address.port : port;
  console.log(`listening on http://${HOST}:${listening}/mcp`);
});
