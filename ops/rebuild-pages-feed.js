#!/usr/bin/env node
/**
 * Rebuild github-pages/data/feed.json + manifest.json
 * Sync PDF / Infographic from Document/{DATE}_Crime* → data/downloads/
 * Build ข้อมูลกราฟ (Obsidian vault graph) → data/graph.json
 * Build per-case ego SVGs → data/graphs/{case_id}.svg
 * Downloads list prioritizes PDF (สรุปรายวัน) over JSON.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "github-pages", "data");
const DOWNLOADS = path.join(DATA, "downloads");
const DOCUMENT = path.join(ROOT, "Document");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function mergePosts(list) {
  const map = new Map();
  for (const p of list) {
    if (!p) continue;
    const key = p.id || p.slug || p.source_url || `${p._date}:${p.title}`;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        ...p,
        corroborating_sources: [...(p.corroborating_sources || [])],
        tags: [...(p.tags || [])],
      });
      continue;
    }
    const cur = map.get(key);
    if (p.source_url && p.source_url !== cur.source_url) {
      cur.corroborating_sources.push({ name: p.agency || "แหล่งอื่น", url: p.source_url });
    }
    for (const s of p.corroborating_sources || []) {
      if (s?.url && !cur.corroborating_sources.some((x) => x.url === s.url)) {
        cur.corroborating_sources.push(s);
      }
    }
    for (const t of p.tags || []) if (!cur.tags.includes(t)) cur.tags.push(t);
    if ((p.content || "").length > (cur.content || "").length) cur.content = p.content;
    if ((p._date || "") > (cur._date || "")) cur._date = p._date;
  }
  return [...map.values()];
}

/** Sync PDF/PNG for a date from Document folders into github-pages/data/downloads */
function syncDownloads(date) {
  ensureDir(DOWNLOADS);
  const candidates = [
    {
      srcs: [
        path.join(DOCUMENT, `${date}_Crime`, `${date}_crime.pdf`),
        path.join(DOCUMENT, `${date}_Crime`, `${date}_crime_report.pdf`),
      ],
      dest: path.join(DOWNLOADS, `${date}_crime.pdf`),
      label: `PDF สรุปข่าว ${date}`,
      kind: "pdf",
      path: `downloads/${date}_crime.pdf`,
    },
    {
      srcs: [
        path.join(DOCUMENT, `${date}_CrimeLine`, `${date}_crime_line.pdf`),
        path.join(DOCUMENT, `${date}_Crime`, `${date}_crime_line.pdf`),
      ],
      dest: path.join(DOWNLOADS, `${date}_crime_line.pdf`),
      label: `PDF จาก LINE ${date}`,
      kind: "pdf",
      path: `downloads/${date}_crime_line.pdf`,
    },
    {
      srcs: [
        path.join(DOCUMENT, `${date}_Crime`, `${date}_infographic.png`),
      ],
      dest: path.join(DOWNLOADS, `${date}_infographic.png`),
      label: `Infographic ${date}`,
      kind: "image",
      path: `downloads/${date}_infographic.png`,
    },
    {
      srcs: [
        path.join(DOCUMENT, `${date}_CrimeLine`, `${date}_infographic_line.png`),
        path.join(DOCUMENT, `${date}_Crime`, `${date}_infographic_line.png`),
      ],
      dest: path.join(DOWNLOADS, `${date}_infographic_line.png`),
      label: `Infographic LINE ${date}`,
      kind: "image",
      path: `downloads/${date}_infographic_line.png`,
    },
  ];

  const downloads = [];
  for (const item of candidates) {
    let ok = fs.existsSync(item.dest);
    if (!ok) {
      for (const src of item.srcs) {
        if (copyIfExists(src, item.dest)) {
          ok = true;
          console.log(`  synced ${path.relative(ROOT, src)} → downloads/`);
          break;
        }
      }
    }
    // already in downloads/ from prior copy
    if (!ok && fs.existsSync(item.dest)) ok = true;
    if (ok) {
      downloads.push({
        label: item.label,
        path: item.path,
        kind: item.kind,
      });
    }
  }
  return downloads;
}

ensureDir(DOWNLOADS);

const files = fs
  .readdirSync(DATA)
  .filter((f) => /_crime(_line)?\.json$/.test(f) && !f.includes("sample"));

const byDate = new Map();
for (const file of files) {
  const m = file.match(/^(\d{4}-\d{2}-\d{2})_crime/);
  if (!m) continue;
  const date = m[1];
  const json = readJson(path.join(DATA, file));
  if (!json) continue;
  const posts = (json.posts || []).map((p) => ({ ...p, _date: date }));
  const prev = byDate.get(date) || { date, posts: [], stats: {}, files: [] };
  prev.posts.push(...posts);
  prev.stats = { ...prev.stats, ...(json.stats || {}) };
  prev.files.push(file);
  byDate.set(date, prev);
}

const days = [...byDate.values()]
  .map((d) => {
    const posts = mergePosts(d.posts);
    const downloads = syncDownloads(d.date);
    return {
      date: d.date,
      status: "published",
      total: posts.length,
      crime_file: d.files.find((f) => f.endsWith("_crime.json")) || d.files[0],
      downloads, // PDF / PNG only — ไม่ใส่ JSON ในแท็บดาวน์โหลด
      _posts: posts,
      _stats: d.stats,
    };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

const allPosts = mergePosts(days.flatMap((d) => d._posts)).sort((a, b) => {
  const dd = (b._date || "").localeCompare(a._date || "");
  return dd || String(b.published_at || "").localeCompare(String(a.published_at || ""));
});

const generated_at = new Date().toISOString();

const feed = {
  generated_at,
  schema_version: 1,
  days: days.map(({ date, total, crime_file }) => ({ date, total, crime_file })),
  posts: allPosts,
  stats: { total: allPosts.length },
};

const manifest = {
  generated_at,
  schema_version: 1,
  default_range: "all",
  days: days.map(({ date, status, total, crime_file, downloads }) => ({
    date,
    status,
    total,
    crime_file,
    downloads,
  })),
};

fs.writeFileSync(path.join(DATA, "feed.json"), JSON.stringify(feed, null, 1) + "\n");
fs.writeFileSync(path.join(DATA, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");

const pdfDays = days.filter((d) => d.downloads.some((x) => x.kind === "pdf")).length;
console.log(
  `feed.json: ${allPosts.length} posts / ${days.length} day(s) · PDF ready: ${pdfDays} day(s)`
);
if (!pdfDays) {
  console.warn(
    "WARN: no PDF in data/downloads — place Document/{DATE}_Crime/{DATE}_crime.pdf then re-run"
  );
}

// ข้อมูลกราฟ: vault wikilinks → graph.json (vault/ is local; graph is published)
const graphScript = path.join(__dirname, "build-obsidian-graph.js");
if (fs.existsSync(graphScript)) {
  const r = spawnSync(process.execPath, [graphScript], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    console.warn("WARN: build-obsidian-graph.js failed — Pages ข้อมูลกราฟ tab may be stale");
  }
}

// Per-story ego subgraphs for blog/detail + PDF embeds
const egoScript = path.join(__dirname, "build-case-ego-graphs.js");
if (fs.existsSync(egoScript)) {
  const r = spawnSync(process.execPath, [egoScript], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    console.warn("WARN: build-case-ego-graphs.js failed — per-story graphs may be missing");
  }
}
