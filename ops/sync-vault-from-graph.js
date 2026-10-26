/**
 * Refresh Obsidian case notes from github-pages/data/graph.json.
 * Does not open SQLite. Vault stays local (gitignored).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vaultCases = path.join(root, "vault", "20_Cases");
const graphPath = path.join(root, "github-pages", "data", "graph.json");
const indexPath = path.join(root, "vault", "เชื่อมข่าวก่อนหน้า.md");

function relBucket(node, label) {
  if (node?.kind === "case" || label === "เกี่ยวข้องกับ" || label === "ติดตามจาก") return "rel_cases";
  const group = node?.entity_group || "";
  if (group === "บุคคล" || group === "ผู้ต้องหา" || label === "เกี่ยวข้องกับบุคคล" || label === "ผู้ต้องหา") {
    return "rel_people";
  }
  if (group === "บัญชี" || group === "ข่ายเครือข่าย" || label === "บัญชี" || label === "เป้าหมายเครือข่าย") {
    return "rel_projects";
  }
  return "rel_units";
}

function replaceFmKey(raw, key, value) {
  const end = raw.indexOf("\n---", 3);
  if (!raw.startsWith("---") || end < 0) return raw;
  const line = `${key}: ${JSON.stringify(value)}`;
  const fm = raw.slice(0, end);
  const at = fm.indexOf(`\n${key}:`);
  let nextFm = `${fm.trimEnd()}\n${line}`;
  if (at >= 0) {
    const lineEnd = fm.indexOf("\n", at + 1);
    const tail = lineEnd < 0 ? "" : fm.slice(lineEnd);
    nextFm = fm.slice(0, at + 1) + line + tail;
  }
  return nextFm + raw.slice(end);
}

function upsertSection(body, heading, markdown) {
  const header = `## ${heading}\n`;
  const block = `${header}${markdown.trim()}\n`;
  if (body.startsWith(header)) {
    const next = body.indexOf("\n## ", header.length);
    const rest = next < 0 ? "" : body.slice(next);
    return block + rest.replace(/^\n/, "");
  }
  const marker = `\n${header}`;
  const start = body.indexOf(marker);
  if (start < 0) return `${body.trimEnd()}\n\n${block}`;
  const next = body.indexOf("\n## ", start + marker.length);
  const end = next < 0 ? body.length : next;
  return body.slice(0, start + 1) + block + body.slice(end).replace(/^\n/, "");
}

function linkLine(edge, byId) {
  const other = byId.get(edge.target);
  const title = other?.title || edge.target;
  return `- ${edge.label} [[${edge.target}|${title}]]`;
}

function earlierLine(edge, byId, selfDate) {
  const other = byId.get(edge.target);
  const when = other?.date || "";
  const title = other?.title || edge.target;
  const whenNote = when && when < selfDate ? `ข่าววันที่ ${when}` : `วันที่ ${when || "—"}`;
  return `- ${edge.label} — ${whenNote} — [[${edge.target}|${title}]]`;
}

const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const byId = new Map(graph.nodes.map((node) => [node.id, node]));
const outgoing = new Map();
for (const edge of graph.edges) {
  const list = outgoing.get(edge.source) || [];
  list.push(edge);
  outgoing.set(edge.source, list);
}

const pairs = [];
let updated = 0;
let skipped = 0;

for (const node of graph.nodes) {
  if (node.kind !== "case") continue;
  const file = path.join(vaultCases, `${node.case_id || path.basename(node.id)}.md`);
  if (!fs.existsSync(file)) {
    skipped += 1;
    continue;
  }
  let raw = fs.readFileSync(file, "utf8");
  if (/generated:\s*false/.test(raw.slice(0, raw.indexOf("\n---", 3)))) {
    skipped += 1;
    continue;
  }
  const edges = (outgoing.get(node.id) || []).toSorted((a, b) => a.target.localeCompare(b.target));
  const buckets = { rel_units: [], rel_people: [], rel_projects: [], rel_cases: [] };
  for (const edge of edges) {
    const target = byId.get(edge.target);
    const bucket = relBucket(target, edge.label);
    buckets[bucket].push({ target: edge.target, rel: edge.label });
  }
  for (const key of Object.keys(buckets)) raw = replaceFmKey(raw, key, buckets[key]);

  const end = raw.indexOf("\n---", 3);
  let body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const relLines = edges.map((edge) => linkLine(edge, byId));
  body = upsertSection(body, "ความสัมพันธ์", relLines.length ? relLines.join("\n") : "- ไม่มีเส้นที่ตั้งชื่อไว้");

  const selfDate = node.date || "";
  const toEarlier = edges.filter((edge) => {
    const other = byId.get(edge.target);
    return other?.kind === "case" && other.date && selfDate && other.date < selfDate;
  });
  const fromLater = edges.filter((edge) => {
    const other = byId.get(edge.target);
    return other?.kind === "case" && other.date && selfDate && other.date > selfDate;
  });
  const cross = [];
  if (toEarlier.length) {
    cross.push("เชื่อมกับข่าวก่อนหน้า:", ...toEarlier.map((edge) => earlierLine(edge, byId, selfDate)));
  } else cross.push("ไม่มีเส้นไปข่าวที่มาก่อนหน้านี้");
  if (fromLater.length) {
    cross.push("", "มีข่าวภายหลังที่เชื่อมมา:", ...fromLater.map((edge) => earlierLine(edge, byId, selfDate)));
  }
  body = upsertSection(body, "เชื่อมข่าวก่อนหน้า", cross.join("\n"));
  fs.writeFileSync(file, raw.slice(0, end + 4) + "\n" + body.replace(/^\n/, ""), "utf8");
  updated += 1;

  for (const edge of toEarlier) {
    const other = byId.get(edge.target);
    pairs.push({
      laterDate: selfDate,
      laterId: node.case_id,
      laterTitle: node.title,
      label: edge.label,
      earlierDate: other.date,
      earlierId: other.case_id,
      earlierTitle: other.title,
    });
  }
}

const unique = [];
const seen = new Set();
for (const row of pairs.toSorted((a, b) => a.earlierDate.localeCompare(b.earlierDate) || a.laterDate.localeCompare(b.laterDate))) {
  const key = `${row.earlierId}|${row.laterId}|${row.label}`;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(row);
}

const lines = [
  "# ข่าวที่เชื่อมกับข่าวก่อนหน้า",
  "",
  `อัปเดตจาก graph.json — ${unique.length} คู่ (นับจากข่าวที่มาทีหลังชี้ไปข่าวนำหน้า)`,
  "",
  ...unique.map(
    (row) =>
      `- ${row.laterDate} [[20_Cases/${row.laterId}|${row.laterTitle}]] **${row.label}** ข่าว ${row.earlierDate} [[20_Cases/${row.earlierId}|${row.earlierTitle}]]`
  ),
  "",
];
fs.writeFileSync(indexPath, lines.join("\n"), "utf8");
console.log(JSON.stringify({ updated, skipped, linkedToEarlier: unique.length, index: indexPath }, null, 2));
for (const row of unique) {
  console.log(`${row.laterDate} ${row.laterId} ${row.label} <- ${row.earlierDate} ${row.earlierId}`);
}
