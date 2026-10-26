/**
 * Write/update Obsidian notes from the cases table.
 * Existing case bodies are kept. Frontmatter gains bureau, status, rel_*.
 * Notes with generated: false are never overwritten.
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db/index.js";
import { vaultDir } from "../brain/files.js";
import { listCases, type CaseRow } from "../brain/store.js";

function splitFm(raw: string): { fm: string; body: string; generated: boolean } {
  if (!raw.startsWith("---")) return { fm: "", body: raw, generated: true };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { fm: "", body: raw, generated: true };
  const fm = raw.slice(3, end);
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const generated = !/generated:\s*false/.test(fm);
  return { fm, body, generated };
}

function yamlEscape(s: string) {
  return JSON.stringify(s);
}

function relLines(rels: Array<{ rel: string; dst_type: string; target: string }>) {
  const units = rels.filter((r) => r.dst_type === "entity" && r.rel !== "announced_by" && r.rel !== "targets_network");
  const people = rels.filter((r) => r.rel === "announced_by");
  const projects = rels.filter((r) => r.rel === "targets_network");
  const cases = rels.filter((r) => r.dst_type === "case");
  const pack = (rows: typeof rels) =>
    JSON.stringify(rows.map((r) => ({ target: r.target, rel: r.rel })));
  return { units: pack(units), people: pack(people), projects: pack(projects), cases: pack(cases), rels };
}

function loadRels(stmt: { all: (id: string) => unknown[] }, id: string) {
  const relRows = stmt.all(id) as Array<{ rel: string; dst_type: string; dst_id: string }>;
  return relRows.map((raw) => ({
    rel: raw.rel,
    dst_type: raw.dst_type,
    target: raw.dst_id.includes(":") ? raw.dst_id.slice(raw.dst_id.indexOf(":") + 1) : raw.dst_id,
  }));
}

function upsertCaseNote(row: CaseRow, rels: ReturnType<typeof loadRels>) {
  const dir = path.join(vaultDir(), "20_Cases");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${row.id}.md`);
  const payload = row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : {};
  const packed = relLines(rels);
  let body = "";
  if (fs.existsSync(file)) {
    const cur = splitFm(fs.readFileSync(file, "utf8"));
    if (!cur.generated) return "skipped";
    body = cur.body.trimEnd();
  } else {
    const blurb =
      typeof payload.exec_blurb === "string" ? payload.exec_blurb : "";
    body = `# ${row.title}\n\n${blurb}\n`;
  }
  if (!body.includes("## ความสัมพันธ์")) {
    const lines = packed.rels
      .map((r) => `- [[${r.target}|rel:${r.rel}]]`)
      .join("\n");
    if (lines) body += `\n\n## ความสัมพันธ์\n${lines}\n`;
  }
  const provinces = row.province_json || "[]";
  const fm = [
    "---",
    "type: case",
    "generated: true",
    "format_version: 2",
    `case_id: ${yamlEscape(row.id)}`,
    `date: ${row.date}`,
    `crime_type: ${yamlEscape(row.topic || "")}`,
    `bureau: ${yamlEscape(row.bureau || "-")}`,
    `area: ${yamlEscape(row.area || "-")}`,
    `status_th: ${yamlEscape(row.status_th || "-")}`,
    `gang_or_group: ${yamlEscape(row.gang_or_group || "-")}`,
    `severity: ${row.severity || "low"}`,
    `provinces: ${provinces}`,
    `rel_units: ${packed.units}`,
    `rel_people: ${packed.people}`,
    `rel_projects: ${packed.projects}`,
    `rel_cases: ${packed.cases}`,
    "---",
    "",
  ].join("\n");
  fs.writeFileSync(file, fm + body.replace(/^\n/, "") + "\n", "utf8");
  return "written";
}

function ensureEntity(kindDir: string, name: string, kind: string) {
  const dir = path.join(vaultDir(), "30_Entities", kindDir);
  fs.mkdirSync(dir, { recursive: true });
  const safe = name.replace(/[\\/:*?"<>|]/g, " ").trim() || "unnamed";
  const file = path.join(dir, `${safe}.md`);
  if (fs.existsSync(file)) return;
  const fm = `---
type: ${kind}
generated: true
name: ${yamlEscape(name)}
---
# ${name}

โน้ตสำหรับค้นหาใน Obsidian ไม่ใส่รายชื่อคดีทั้งก้อน — ใช้ Bases หรือ backlink
`;
  fs.writeFileSync(file, fm, "utf8");
}

function slimCrimeTypes() {
  const dir = path.join(vaultDir(), "40_CrimeTypes");
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".md")) continue;
    const file = path.join(dir, name);
    const raw = fs.readFileSync(file, "utf8");
    const cur = splitFm(raw);
    if (!cur.generated && raw.includes("generated: false")) continue;
    const title = name.replace(/\.md$/i, "");
    fs.writeFileSync(
      file,
      `---
type: crime_type
generated: true
crime_type: ${yamlEscape(title)}
---
# ${title}

หน้ารวมประเภทคดี ใช้เป็นคุณสมบัติของคดี ไม่ฝังรายการ \`[[คดี]]\` ทั้งคลัง
กรองใน Bases จาก \`crime_type\` แทน
`,
      "utf8",
    );
    n++;
  }
  return n;
}

const db = getDb();
try {
const cases = listCases();
const relStmt = db.prepare(
  `SELECT rel, dst_type, dst_id FROM relations WHERE src_type='case' AND src_id=?`,
);
let written = 0;
let skipped = 0;
const seenUnits = new Set<string>();
const seenPeople = new Set<string>();
const seenProjects = new Set<string>();
for (const row of cases) {
  const rels = loadRels(relStmt, row.id);
  let noteResult: string;
  try {
    noteResult = upsertCaseNote(row, rels);
  } catch (err) {
    console.error("note failed", row.id, err);
    throw err;
  }
  if (noteResult === "skipped") skipped++;
  else written++;
  for (const rel of rels) {
    if (rel.rel === "announced_by") seenPeople.add(rel.target);
    else if (rel.rel === "targets_network") seenProjects.add(rel.target);
    else if (rel.dst_type === "entity") seenUnits.add(rel.target);
  }
}
for (const n of seenUnits) ensureEntity("Units", n, "unit");
for (const n of seenPeople) ensureEntity("People", n, "person");
for (const n of seenProjects) ensureEntity("Projects", n, "project");
const types = slimCrimeTypes();
console.log(
  JSON.stringify({
    vault: vaultDir(),
    cases: cases.length,
    written,
    skipped,
    units: seenUnits.size,
    people: seenPeople.size,
    projects: seenProjects.size,
    crime_types_slimmed: types,
  }),
);
} catch (err) {
  console.error("vault-build failed", err);
  process.exitCode = 1;
} finally {
  db.close();
}
