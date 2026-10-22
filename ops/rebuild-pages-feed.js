#!/usr/bin/env node
/**
 * Rebuild github-pages/data/feed.json (+ refresh manifest days)
 * from every *_crime.json / *_crime_line.json under github-pages/data/
 */
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "github-pages", "data");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
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
    return {
      date: d.date,
      status: "published",
      total: posts.length,
      crime_file: d.files.find((f) => f.endsWith("_crime.json")) || d.files[0],
      downloads: [
        {
          label: `JSON ข่าว ${d.date}`,
          path: d.files.find((f) => f.endsWith("_crime.json")) || d.files[0],
          kind: "json",
        },
      ],
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
console.log(`feed.json: ${allPosts.length} posts across ${days.length} day(s)`);
