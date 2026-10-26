import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planCaseRelations, relPhrase, specificGangName } from "./relate.js";

export type Rel = { target: string; rel: string };

export type PostV2 = Record<string, unknown> & {
  id?: string;
  title?: string;
  topic?: string;
  content?: string;
  date?: string;
  case_stage?: string;
  severity?: string;
  verification?: string;
  province?: string[];
  tags?: string[];
  primary_bureau?: string;
  area?: string;
  status_th?: string;
  gang_or_group?: string;
  exec_blurb?: string;
  analysis_notes?: string;
  related_cases?: Array<{ id: string; title: string; relation: string }>;
  references?: Array<{ name: string; url: string }>;
  format_version?: number;
  police_performance?: { units_involved?: string[]; outcome?: string; operation?: string; note?: string };
  stats?: { loss_thb?: number | null; seized_value_thb?: number | null };
  source_url?: string;
  corroborating_sources?: Array<{ name?: string; url?: string }>;
};

type BureauCfg = {
  exact: Record<string, string>;
  contains: Array<{ match: string; bureau: string }>;
  status_th: Record<string, string>;
  commander_titles: string[];
};

const cfgPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../config/bureaus.json",
);

let cfgCache: BureauCfg | null = null;

export function bureauConfig(): BureauCfg {
  if (cfgCache) return cfgCache;
  cfgCache = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as BureauCfg;
  return cfgCache;
}

export function mapBureau(units: string[], text = ""): string {
  const cfg = bureauConfig();
  const blob = [...units, text].join(" | ");
  for (const u of units) {
    const hit = cfg.exact[u.trim()];
    if (hit) return hit;
  }
  const rules = [...cfg.contains].sort((a, b) => b.match.length - a.match.length);
  for (const rule of rules) {
    if (blob.includes(rule.match)) return rule.bureau;
  }
  return units[0]?.trim() || "-";
}

export function mapStatus(stage: string | undefined): string {
  const s = (stage || "").trim();
  if (!s) return "-";
  const cfg = bureauConfig();
  if (cfg.status_th[s]) return cfg.status_th[s];
  for (const [k, v] of Object.entries(cfg.status_th)) {
    if (s.includes(k)) return v;
  }
  return s;
}

export function guessGang(post: PostV2): string {
  const tags = post.tags || [];
  const hit = tags.find((t) => /แก๊ง|เครือข่าย|เว็บพนัน|คอลเซ็นเตอร์/.test(t) && t.length <= 48);
  if (hit) return hit;
  const title = post.title || "";
  const m = /(แก๊ง[^\s,]{2,24}|เครือข่าย[^\s,]{2,30})/.exec(title);
  if (m) return m[1];
  return "-";
}

export function unitsOf(post: PostV2): string[] {
  const u = post.police_performance?.units_involved;
  return Array.isArray(u) ? u.map((x) => String(x).trim()).filter(Boolean) : [];
}

export function referencesOf(post: PostV2): Array<{ name: string; url: string }> {
  const out: Array<{ name: string; url: string }> = [];
  if (post.source_url) out.push({ name: "แหล่งหลัก", url: String(post.source_url) });
  for (const s of post.corroborating_sources || []) {
    if (s?.url && !out.some((x) => x.url === s.url)) {
      out.push({ name: s.name || "แหล่งอื่น", url: s.url });
    }
  }
  for (const r of post.references || []) {
    if (r?.url && !out.some((x) => x.url === r.url)) {
      out.push({ name: r.name || "แหล่งอ้างอิง", url: r.url });
    }
  }
  return out;
}

export function money(n: unknown): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "-";
  return `${Math.round(n).toLocaleString("th-TH")} บาท`;
}

/** Template blurbs from the first v2 migration — treat as empty so we can rewrite. */
export function isTemplateBlurb(text: string | undefined): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  return t.startsWith("เรื่องนี้เกี่ยวกับ") || t.startsWith("เรื่องนี้เป็นข่าว");
}

export function isTemplateAnalysis(text: string | undefined): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  if (t.startsWith("- ประเภทคดี:")) return true;
  if (t.startsWith("- สาระจากแหล่ง:") && t.includes("ข้อสังเกตอิงเฉพาะข้อเท็จจริง")) return true;
  return (
    t.includes("ข้อสังเกตนี้สรุปจากฟิลด์ที่มีอยู่ ไม่ได้เพิ่มข้อเท็จจริงใหม่นอกแหล่งข่าว") &&
    t.startsWith("- ประเภทคดี:")
  );
}

function firstSentences(text: string, maxChars = 220): string {
  // Avoid regex sentence splits — Thai copy uses "น." / decimals that look like terminators.
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  if (clean.length <= maxChars) return clean;
  const window = clean.slice(0, maxChars);
  const sp = window.lastIndexOf(" ");
  const cut = sp > Math.floor(maxChars * 0.62) ? window.slice(0, sp) : window;
  const dangling = new Set([
    "ใน", "ที่", "ของ", "และ", "หรือ", "โดย", "จาก", "กับ", "เพื่อ", "แล้ว", "ว่า", "คือ", "เป็น",
    "ได้", "ไม่", "จะ", "มา", "ไป", "อยู่", "ตาม", "ซึ่ง", "ให้", "ถึง", "กว่า", "หลัง", "ก่อน", "ประเภท", "ข้อหา",
  ]);
  const words = cut.trimEnd().split(" ");
  const endsOpen = (word) =>
    dangling.has(word) || /^\d{1,4}$/.test(word) || /(?:วันที่|ใน|ที่|ของ|และ|โดย|ประเภท|ข้อหา)$/.test(word);
  while (words.length > 6 && endsOpen(words[words.length - 1])) words.pop();
  return words.join(" ").trim();
}

function finishSentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (/[.…]$/.test(t)) return t;
  return `${t}.`;
}

function shortenTitle(title: string, max = 110): string {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function wherePhrase(post: PostV2): string {
  const provinces = Array.isArray(post.province) ? post.province.filter(Boolean) : [];
  if (provinces.length) return provinces.join(" ");
  if (post.area && post.area !== "-") return post.area;
  return "";
}

function scaleFacts(post: PostV2): string[] {
  const out: string[] = [];
  const loss = post.stats?.loss_thb;
  const seized = post.stats?.seized_value_thb;
  if (typeof loss === "number" && loss > 0) out.push(`ความเสียหายที่แหล่งระบุ ${money(loss)}`);
  if (typeof seized === "number" && seized > 0) out.push(`ของกลางที่แหล่งระบุ ${money(seized)}`);
  const provinces = Array.isArray(post.province) ? post.province.filter(Boolean) : [];
  if (provinces.length >= 2) out.push(`ข่าวกล่าวถึงจังหวัด ${provinces.join(" ")}`);
  return out;
}

function openingSentence(post: PostV2): string {
  const where = wherePhrase(post);
  const topic = (post.topic || "เหตุการณ์").trim();
  const essence =
    firstSentences(String(post.content || ""), 320) || shortenTitle(post.title || "", 140);
  if (essence) return essence.endsWith(".") ? essence : `${essence}.`;
  return where ? `เรื่องนี้เป็นข่าว${topic}ในพื้นที่${where}` : `เรื่องนี้เป็นข่าว${topic}`;
}

function blurbExtras(post: PostV2): string[] {
  const extra: string[] = [];
  const bureau = post.primary_bureau && post.primary_bureau !== "-" ? post.primary_bureau : "";
  const gang = specificGangName(post.gang_or_group || "");
  if (bureau) extra.push(`หน่วยงานหลักที่ปรากฏในข่าวคือ${bureau}`);
  if (gang) extra.push(`ชื่อกลุ่มที่ระบุไว้คือ${gang}`);
  extra.push(...scaleFacts(post));
  return extra;
}

export function buildExecBlurb(post: PostV2): string {
  const status = post.status_th || mapStatus(post.case_stage) || "-";
  const sentences: string[] = [openingSentence(post)];
  if (status && status !== "-") sentences.push(`สถานะที่แหล่งข่าวระบุคือ${status}`);
  const extra = blurbExtras(post);
  if (extra.length) sentences.push(extra.join(" "));
  while (sentences.length < 2) sentences.push("ข้อความนี้สรุปจากข่าวเรื่องนี้เท่านั้น");
  return sentences.slice(0, 4).map(finishSentence).join(" ");
}

function noteWhatHappened(post: PostV2): string {
  const essence =
    firstSentences(String(post.content || ""), 420) || shortenTitle(post.title || "", 160);
  return `- เหตุการณ์: ${essence || "-"}`;
}

function noteActionStatus(post: PostV2): string {
  const units = unitsOf(post);
  const bureau = post.primary_bureau || "-";
  const status = post.status_th || mapStatus(post.case_stage) || "-";
  const who = units.length ? units.join(", ") : bureau;
  const op = String(post.police_performance?.operation || "").trim();
  const opBit =
    op && op !== "N/A" && op !== "-" && op.length <= 140 ? ` สิ่งที่ทำตามข่าว: ${op}` : "";
  return `- หน่วยและสถานะ: ${who || "-"} สถานะ ${status}.${opBit}`;
}

function noteScale(post: PostV2): string | null {
  const facts = scaleFacts(post);
  if (!facts.length) return null;
  return `- ตัวเลขในข่าว: ${facts.join(" · ")}`;
}

function noteGang(post: PostV2): string | null {
  const gang = specificGangName(post.gang_or_group || "") || "";
  const raw = (post.gang_or_group || "").trim();
  if (gang) return `- ชื่อกลุ่มที่ข่าวระบุ: ${gang}`;
  if (raw && raw !== "-" && raw.length >= 6) return `- ชื่อกลุ่มที่ข่าวระบุ: ${raw}`;
  return null;
}

function linkedTitle(title: string, id: string): string {
  const t = shortenTitle(String(title || "").trim(), 90);
  if (/[ก-๙]/.test(t)) return t;
  return `ข่าวภาษาอังกฤษเรื่องเดียวกัน (${id})`;
}

export function relatedAnalysisLine(
  related: Array<{ id: string; title: string; relation: string }>,
): string {
  return noteRelated(related);
}

function noteRelated(
  related: Array<{ id: string; title: string; relation: string }>,
): string {
  if (!related.length) {
    return "- ความเชื่อมโยง: ไม่มีเส้นไปข่าวอื่น — ไม่ใช่เหตุการณ์เดียวกันหรือการติดตามผลที่ชี้ได้";
  }
  const why = related
    .map((r) => `${relPhrase(r.relation)} «${linkedTitle(r.title, r.id)}»`)
    .join(" · ");
  return `- ความเชื่อมโยง: ${why}`;
}

function noteCaution(post: PostV2): string {
  const blob = `${post.topic || ""} ${(post.tags || []).join(" ")} ${post.title || ""}`;
  if (/เด็ก|เยาวชน|ชำเรา|ค้ามนุษย์|ทางเพศ|ล่วงละเมิด/.test(blob)) {
    return "- ข้อควรระวัง: ไม่เปิดเผยข้อมูลที่ระบุตัวเด็กหรือผู้เสียหาย ผู้ถูกกล่าวหายังไม่ถือว่ากระทำผิดจนกว่าศาลจะพิพากษา";
  }
  return "- ข้อควรระวัง: ผู้ถูกกล่าวหายังไม่ถือว่ากระทำผิดจนกว่าศาลจะพิพากษา";
}

export function buildAnalysisNotes(
  post: PostV2,
  related: Array<{ id: string; title: string; relation: string }> = [],
): string {
  const lines: string[] = [noteWhatHappened(post), noteActionStatus(post)];
  const optional = [noteScale(post), noteGang(post)];
  for (const line of optional) {
    if (line) lines.push(line);
  }
  lines.push(noteRelated(related), noteCaution(post));
  while (lines.length > 7) {
    const dropIdx = lines.findIndex((l) => l.startsWith("- ชื่อกลุ่ม"));
    if (dropIdx >= 0) lines.splice(dropIdx, 1);
    else lines.splice(2, 1);
  }
  return lines.join("\n");
}

/**
 * Same-incident / named-network links only. See relate.ts.
 * Province + topic, a shared tag, or the same broad unit is not a link.
 */
export function relatedHeuristic(
  post: PostV2,
  day: string,
  all: Array<{ day: string; post: PostV2 }>,
): Array<{ id: string; title: string; relation: string }> {
  const id = String(post.id || "");
  if (!id) return [];
  const pool = all.some((row) => String(row.post.id || "") === id) ? all : [{ day, post }, ...all];
  return planCaseRelations(pool).rels.get(id) || [];
}

export type EnrichOptions = {
  /** Rewrite exec_blurb / analysis_notes even if already set (templates always rewritten). */
  forceAnalysis?: boolean;
  /** Rebuild related_cases even if already set. */
  forceRelated?: boolean;
};

/** Fill v2 fields without replacing content. */
export function enrichPost(post: PostV2, day: string, opts: EnrichOptions = {}): PostV2 {
  const content = typeof post.content === "string" ? post.content : "";
  const units = unitsOf(post);
  const provinces = Array.isArray(post.province) ? post.province.filter(Boolean) : [];
  const bureau = post.primary_bureau || mapBureau(units, `${post.title || ""} ${content.slice(0, 400)}`);
  const area = post.area || (provinces.length ? provinces.join(", ") : "-");
  const status = post.status_th || mapStatus(post.case_stage);
  const gang = post.gang_or_group || guessGang(post);

  const base: PostV2 = {
    ...post,
    format_version: 2,
    primary_bureau: bureau,
    area,
    status_th: status,
    gang_or_group: gang,
    references: post.references?.length ? post.references : referencesOf(post),
    _day: day,
  };

  const rewriteBlurb = opts.forceAnalysis || isTemplateBlurb(post.exec_blurb);
  const rewriteNotes = opts.forceAnalysis || isTemplateAnalysis(post.analysis_notes);
  // forceRelated clears here; migrate will refill via relatedHeuristic.
  const related = opts.forceRelated ? [] : post.related_cases || [];

  base.related_cases = related;
  base.exec_blurb = rewriteBlurb ? buildExecBlurb(base) : post.exec_blurb;
  // analysis notes may be refreshed again after related heuristics in migrate
  base.analysis_notes = rewriteNotes
    ? buildAnalysisNotes(base, related)
    : post.analysis_notes;

  return base;
}

export function relForStage(stage = ""): string {
  if (/จับ/.test(stage)) return "arrested_by";
  if (/หมาย/.test(stage)) return "investigated_by";
  if (/แถลง|ประชาสัมพันธ์|นโยบาย/.test(stage)) return "announced_by";
  return "investigated_by";
}

/** Courts issue warrants; they do not arrest. Prosecutors charge. */
export function relForUnit(name: string, stageRel: string): string {
  const n = String(name || "");
  if (/ศาล/.test(n)) return "warrant_from";
  if (/อัยการ/.test(n)) return "announced_by";
  return stageRel;
}

export function commandersIn(text: string): string[] {
  const titles = bureauConfig().commander_titles;
  return titles.filter((t) => text.includes(t));
}

export function dayDistance(a: string, b: string): number {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 999;
  return Math.abs(da - db) / 86_400_000;
}
