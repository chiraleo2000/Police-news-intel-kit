import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAnalysisNotes,
  buildExecBlurb,
  enrichPost,
  type EnrichOptions,
  type PostV2,
} from "./enrich.js";
import { planCaseRelations } from "./relate.js";
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
  opts: EnrichOptions = {},
): MigrateRow[] {
  const rows: MigrateRow[] = [];
  try {
    const day = readDayFile(file);
    for (const post of day.doc.posts || []) {
      const contentBefore = String(post.content || "");
      const enriched = enrichPost(post, day.date, opts);
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

function applyRelatedHeuristics(all: MigrateRow[]): { edges: number; detail: string[] } {
  const planned = planCaseRelations(all.map((row) => ({ day: row.day, post: row.post })));
  for (const row of all) {
    const id = String(row.post.id || "");
    row.post.related_cases = id ? planned.rels.get(id) || [] : [];
    row.post.exec_blurb = buildExecBlurb(row.post);
    row.post.analysis_notes = buildAnalysisNotes(row.post, row.post.related_cases || []);
  }
  return {
    edges: planned.edges.length,
    detail: planned.edges.map((e) => `${e.a} <-> ${e.b} | ${e.follow ? "follow" : "related"} | ${e.via}`),
  };
}

function writeMigratedDay(file: string, byFile: Map<string, PostV2[]>, doIndex: boolean) {
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
  if (doIndex) {
    for (const post of day.doc.posts || []) indexPost(post, day.date);
  }
}

export type MigrateOptions = EnrichOptions & {
  /** Open SQLite. Keep false while news-hub holds server/data/newshub.sqlite. */
  index?: boolean;
  /** Compute links and print them without writing JSON or the vault. */
  dryRun?: boolean;
};

export function migrateCrimeJson(opts: MigrateOptions = {}): {
  files: number;
  posts: number;
  errors: string[];
  edges: number;
  vaultNotes: number;
} {
  const errors: string[] = [];
  const files = crimeJsonFiles();
  const all: MigrateRow[] = [];
  for (const file of files) {
    all.push(...enrichDayFile(file, errors, { ...opts, forceAnalysis: true, forceRelated: true }));
  }
  const planned = applyRelatedHeuristics(all);
  const edges = planned.edges;
  if (opts.dryRun) {
    for (const line of planned.detail) console.log(line);
  }
  const byFile = new Map<string, PostV2[]>();
  for (const row of all) {
    const list = byFile.get(row.file) || [];
    list.push(row.post);
    byFile.set(row.file, list);
  }
  console.log(`migrate: ${all.length} posts, ${edges} case-case edges, write=${opts.dryRun ? "no" : "yes"} index=${opts.index === true}`);
  let vaultNotes = 0;
  if (!opts.dryRun) {
    const doIndex = opts.index === true;
    for (const file of files) writeMigratedDay(file, byFile, doIndex);
    vaultNotes = syncVaultCaseLinks(all).notes;
  }
  return { files: files.length, posts: all.length, errors, edges, vaultNotes };
}

function esc(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sourceListHtml(p: PostV2): string {
  const items: Array<{ name: string; url: string }> = [];
  const seen = new Set<string>();
  const push = (name: string, url: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    items.push({ name, url });
  };
  if (p.source_url) push("แหล่งหลัก", String(p.source_url));
  for (const r of p.references || []) {
    if (r?.url) push(r.name || "แหล่งอ้างอิง", r.url);
  }
  for (const s of p.corroborating_sources || []) {
    if (s?.url) push(s.name || "แหล่งอื่น", s.url);
  }
  if (!items.length) return `<p><b>แหล่งที่มา:</b> —</p>`;
  const lis = items
    .map((s) => `<li><a href="${esc(s.url)}">${esc(s.name)}</a> — <span class="m">${esc(s.url)}</span></li>`)
    .join("");
  return `<p><b>แหล่งที่มา (${items.length}):</b></p><ul class="sources">${lis}</ul>`;
}

function writeDayHtml(folder: string, date: string, posts: PostV2[], line: boolean) {
  const groups = new Map<string, PostV2[]>();
  for (const p of posts) {
    const k = p.topic || "อื่น ๆ";
    const list = groups.get(k) || [];
    list.push(p);
    groups.set(k, list);
  }
  const fontCss = fs.existsSync(path.join(folder, "fonts", "THSarabun.ttf"))
    ? `@font-face{font-family:THSarabun;src:url(fonts/THSarabun.ttf)}@font-face{font-family:THSarabun;font-weight:bold;src:url(fonts/THSarabun.Bold.ttf)}@font-face{font-family:THSarabun;font-style:italic;src:url(fonts/THSarabun.Italic.ttf)}@font-face{font-family:THSarabun;font-weight:bold;font-style:italic;src:url(fonts/THSarabun.BoldItalic.ttf)}body{font-family:THSarabun,sans-serif;font-size:15pt}`
    : `body{font-family:sans-serif}`;
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
${sourceListHtml(p)}
<p><b>เชื่อมโยง:</b> ${related || "—"}</p>
<p class="m">ประเภทคดี: ${esc(p.topic || "-")} · พื้นที่: ${esc(p.area || "-")} · สถานะ: ${esc(p.status_th || "-")} · กลุ่ม/แก๊ง: ${esc(p.gang_or_group || "-")}</p>`;
        })
        .join("\n");
      return `<h2>${esc(topic)} (${list.length})</h2>\n${cards}`;
    })
    .join("\n");
  const html = `<html><head><meta charset="utf-8"><title>${esc(date)}</title>
<style>${fontCss};line-height:1.45;max-width:900px;margin:24px auto;padding:0 16px}h1{font-size:1.6rem}h2{border-bottom:1px solid #ccc}.m{color:#555}ul.sources{padding-left:1.2em}ul.sources li{margin:0.2em 0}@page{size:A4;margin:16mm}</style>
</head><body>
<h1>สรุปข่าว${line ? " จาก LINE" : ""} ${esc(date)}</h1>
<p>จัดกลุ่มตามประเภทคดีเหมือนเดิม แต่ละเรื่องคงสรุปเดิมไว้ด้านบน แล้วตามด้วยมุมผู้บริหาร การวิเคราะห์ แหล่งที่มา และการเชื่อมโยง</p>
${sections}
</body></html>`;
  const name = line ? `${date}_crime_line.html` : `${date}_crime.html`;
  fs.writeFileSync(path.join(folder, name), html, "utf8");
}

function isCaseTarget(target: string, caseIds: Set<string>): boolean {
  return caseIds.has(target) || /^\d{8}-/.test(target);
}

function splitNoteFrontmatter(text: string): { fm: string; body: string } {
  if (!text.startsWith("---\n")) return { fm: "", body: text };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { fm: "", body: text };
  return {
    fm: text.slice(0, end),
    body: text.slice(end + 4).replace(/^\n/, ""),
  };
}

function withRelCasesFm(fm: string, post: PostV2): string {
  if (!fm) return fm;
  const relCases = (post.related_cases || []).map((r) => ({
    target: r.id,
    rel: r.relation || "related_to",
  }));
  const relLine = `rel_cases: ${JSON.stringify(relCases)}`;
  if (/^rel_cases:/m.test(fm)) return fm.replace(/^rel_cases:.*$/m, relLine);
  return `${fm}\n${relLine}`;
}

function patchRelationsSection(body: string, caseLines: string[], caseIds: Set<string>): string {
  const header = "## ความสัมพันธ์";
  const idx = body.indexOf(header);
  if (idx < 0) {
    if (!caseLines.length) return body;
    return `${body.trimEnd()}\n\n${header}\n${caseLines.join("\n")}\n`;
  }
  const after = body.slice(idx + header.length);
  const next = after.search(/\n## /);
  const section = next < 0 ? after : after.slice(0, next);
  const rest = next < 0 ? "" : after.slice(next);
  const kept = section.split("\n").filter((line) => {
    const m = /\[\[([^\]|#]+)/.exec(line);
    if (!m) return line.trim().length > 0;
    return !isCaseTarget(m[1].trim(), caseIds);
  });
  const bullets = [...kept.map((l) => l.trimEnd()).filter((l) => l.trim()), ...caseLines];
  return `${body.slice(0, idx + header.length)}\n${bullets.join("\n")}\n${rest}`;
}

function patchCaseNote(raw: string, post: PostV2, caseIds: Set<string>): string {
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  const text = raw.replaceAll("\r\n", "\n");
  const split = splitNoteFrontmatter(text);
  const fm = withRelCasesFm(split.fm, post);
  const caseLines = (post.related_cases || []).map(
    (r) => `- [[${r.id}|rel:${r.relation || "related_to"}]]`,
  );
  const body = patchRelationsSection(split.body, caseLines, caseIds);
  const prefix = fm ? `${fm}\n---\n\n` : "";
  const merged = `${prefix}${body.replace(/^\n+/, "")}`;
  const normalized = merged.endsWith("\n") ? merged : `${merged}\n`;
  return nl === "\r\n" ? normalized.replaceAll("\n", "\r\n") : normalized;
}

function syncVaultCaseLinks(rows: MigrateRow[]): { notes: number; missing: number } {
  const byId = new Map<string, PostV2>();
  for (const row of rows) {
    const id = String(row.post.id || "");
    if (id) byId.set(id, row.post);
  }
  const dir = path.join(vaultDir(), "20_Cases");
  if (!fs.existsSync(dir)) return { notes: 0, missing: byId.size };
  const caseIds = new Set(byId.keys());
  let notes = 0;
  const seen = new Set<string>();
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith(".md")) continue;
    const id = name.replace(/\.md$/i, "");
    const post = byId.get(id);
    if (!post) continue;
    seen.add(id);
    const file = path.join(dir, name);
    const raw = fs.readFileSync(file, "utf8");
    const next = patchCaseNote(raw, post, caseIds);
    if (next !== raw) fs.writeFileSync(file, next, "utf8");
    notes++;
  }
  let missing = 0;
  for (const id of byId.keys()) if (!seen.has(id)) missing++;
  return { notes, missing };
}
