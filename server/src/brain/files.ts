import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enrichPost, relatedHeuristic, type PostV2 } from "./enrich.js";
import { indexPost } from "./store.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function kitRoot() {
  return path.resolve(here, "../../..");
}

export function pagesDataDir() {
  return path.join(kitRoot(), "github-pages", "data");
}

export function documentDir() {
  return path.join(kitRoot(), "Document");
}

export function vaultDir() {
  const kit = path.join(kitRoot(), "vault");
  if (fs.existsSync(kit)) return kit;
  return path.join(kitRoot(), "server", "vault");
}

export function crimeJsonFiles(): string[] {
  const dir = pagesDataDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => /^\d{4}-\d{2}-\d{2}_crime(_line)?\.json$/.test(n))
    .map((n) => path.join(dir, n))
    .sort((a, b) => a.localeCompare(b));
}

export type DayFile = {
  file: string;
  date: string;
  line: boolean;
  doc: { date?: string; posts?: PostV2[]; format_version?: number };
};

export function readDayFile(file: string): DayFile {
  const base = path.basename(file);
  const date = base.slice(0, 10);
  const line = base.includes("_crime_line");
  const doc = JSON.parse(fs.readFileSync(file, "utf8")) as DayFile["doc"];
  return { file, date, line, doc };
}

export function indexCrimeJson(): { files: number; posts: number } {
  let posts = 0;
  const files = crimeJsonFiles();
  for (const file of files) {
    const day = readDayFile(file);
    for (const post of day.doc.posts || []) {
      const enriched = enrichPost(post, day.date);
      indexPost(enriched, day.date);
      posts++;
    }
  }
  return { files: files.length, posts };
}

type MigrateRow = { day: string; post: PostV2; file: string };

function enrichDayFile(
  file: string,
  errors: string[],
): MigrateRow[] {
  const rows: MigrateRow[] = [];
  try {
    const day = readDayFile(file);
    for (const post of day.doc.posts || []) {
      const contentBefore = String(post.content || "");
      const enriched = enrichPost(post, day.date);
      if (String(enriched.content || "") !== contentBefore) {
        errors.push(`${file}: content changed for ${post.id}`);
        enriched.content = contentBefore;
      }
      rows.push({ day: day.date, post: enriched, file });
    }
  } catch (err) {
    errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return rows;
}

function applyRelatedHeuristics(all: MigrateRow[]) {
  const pool = all.map((x) => ({ day: x.day, post: x.post }));
  for (const row of all) {
    if (!row.post.related_cases?.length) {
      row.post.related_cases = relatedHeuristic(row.post, row.day, pool);
    }
  }
}

function writeMigratedDay(file: string, byFile: Map<string, PostV2[]>) {
  const day = readDayFile(file);
  day.doc.posts = byFile.get(file) || day.doc.posts;
  day.doc.format_version = 2;
  fs.writeFileSync(file, JSON.stringify(day.doc, null, 1) + "\n", "utf8");
  const folder = path.join(
    documentDir(),
    `${day.date}_${day.line ? "CrimeLine" : "Crime"}`,
  );
  if (fs.existsSync(folder)) {
    const dest = path.join(folder, path.basename(file));
    fs.copyFileSync(file, dest);
    writeDayHtml(folder, day.date, day.doc.posts || [], day.line);
  }
  for (const post of day.doc.posts || []) indexPost(post, day.date);
}

export function migrateCrimeJson(): {
  files: number;
  posts: number;
  errors: string[];
} {
  const errors: string[] = [];
  const files = crimeJsonFiles();
  const all: MigrateRow[] = [];
  for (const file of files) {
    all.push(...enrichDayFile(file, errors));
  }
  applyRelatedHeuristics(all);
  const byFile = new Map<string, PostV2[]>();
  for (const row of all) {
    const list = byFile.get(row.file) || [];
    list.push(row.post);
    byFile.set(row.file, list);
  }
  console.log(`migrate: enriched ${all.length} posts, writing ${files.length} files`);
  for (const file of files) writeMigratedDay(file, byFile);
  return { files: files.length, posts: all.length, errors };
}

function esc(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function writeDayHtml(folder: string, date: string, posts: PostV2[], line: boolean) {
  const groups = new Map<string, PostV2[]>();
  for (const p of posts) {
    const k = p.topic || "อื่น ๆ";
    const list = groups.get(k) || [];
    list.push(p);
    groups.set(k, list);
  }
  const sections = [...groups.entries()]
    .map(([topic, list]) => {
      const cards = list
        .map((p) => {
          const related = (p.related_cases || [])
            .map((r) => `${esc(r.title)} (${esc(r.relation)})`)
            .join("; ");
          return `<h3>${esc(p.title || "")}</h3>
<div class="m">${esc(p.primary_bureau || "-")} · ${esc(p.status_th || "-")} · ${esc((p.province || []).join(", "))}</div>
<p>${esc(p.content || "")}</p>
<p><b>สำหรับผู้บริหาร:</b> ${esc(p.exec_blurb || "")}</p>
<p><b>วิเคราะห์:</b></p><p>${esc(p.analysis_notes || "").replaceAll("\n", "<br>")}</p>
<p><b>เชื่อมโยง:</b> ${related || "—"}</p>
<p class="m">ประเภทคดี: ${esc(p.topic || "-")} · พื้นที่: ${esc(p.area || "-")} · สถานะ: ${esc(p.status_th || "-")} · กลุ่ม/แก๊ง: ${esc(p.gang_or_group || "-")}</p>`;
        })
        .join("\n");
      return `<h2>${esc(topic)} (${list.length})</h2>\n${cards}`;
    })
    .join("\n");
  const html = `<html><head><meta charset="utf-8"><title>${esc(date)}</title>
<style>body{font-family:sans-serif;line-height:1.45;max-width:900px;margin:24px auto;padding:0 16px}h1{font-size:1.6rem}h2{border-bottom:1px solid #ccc}.m{color:#555}</style>
</head><body>
<h1>สรุปข่าว${line ? " จาก LINE" : ""} ${esc(date)}</h1>
<p>จัดกลุ่มตามประเภทคดีเหมือนเดิม แต่ละเรื่องคงสรุปเดิมไว้ด้านบน แล้วตามด้วยมุมผู้บริหาร การวิเคราะห์ และการเชื่อมโยง</p>
${sections}
</body></html>`;
  const name = line ? `${date}_crime_line.html` : `${date}_crime.html`;
  fs.writeFileSync(path.join(folder, name), html, "utf8");
}
