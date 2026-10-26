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
  const cut = sp > Math.floor(maxChars * 0.55) ? window.slice(0, sp) : window;
  return `${cut.trimEnd()}…`;
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
  if (typeof seized === "number" && seized > 0) out.push(`ของกลาง/อายัดที่แหล่งระบุ ${money(seized)}`);
  const provinces = Array.isArray(post.province) ? post.province.filter(Boolean) : [];
  if (provinces.length >= 2) out.push(`ปรากฏหลายจังหวัด: ${provinces.join(", ")}`);
  return out;
}

function openingSentence(post: PostV2): string {
  const where = wherePhrase(post);
  const topic = (post.topic || "เหตุการณ์").trim();
  const essence =
    firstSentences(String(post.content || ""), 160) || shortenTitle(post.title || "", 120);
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
  if (status && status !== "-") sentences.push(`สถานะตามที่แหล่งข่าวรายงานคือ${status}`);
  const extra = blurbExtras(post);
  if (extra.length) sentences.push(extra.join(" "));
  const tags = (post.tags || []).filter(Boolean).slice(0, 4);
  if (tags.length && sentences.length < 4) {
    sentences.push(`ประเด็นที่ปรากฏในแท็ก: ${tags.join(", ")}`);
  }
  while (sentences.length < 2) sentences.push("ข้อความนี้สรุปจากข่าวเรื่องนี้เท่านั้น");
  return sentences
    .slice(0, 4)
    .map((s) => (s.endsWith(".") ? s : `${s}.`))
    .join(" ");
}

function noteWhatHappened(post: PostV2): string {
  const essence =
    firstSentences(String(post.content || ""), 240) || shortenTitle(post.title || "", 160);
  return `- สาระเหตุการณ์: ${essence || "-"}`;
}

function noteActionStatus(post: PostV2): string {
  const units = unitsOf(post);
  const bureau = post.primary_bureau || "-";
  const status = post.status_th || mapStatus(post.case_stage) || "-";
  const who = units.length ? units.join(", ") : bureau;
  const op = String(post.police_performance?.operation || "").trim();
  const opBit =
    op && op !== "N/A" && op !== "-" && op.length <= 120 ? ` · การปฏิบัติที่ระบุ: ${op}` : "";
  return `- หน่วยและสถานะ: ${who || "-"} · สถานะ ${status}${opBit}`;
}

function noteTagsMo(post: PostV2): string | null {
  const tags = (post.tags || []).filter(Boolean);
  if (!tags.length) return null;
  return `- รูปแบบ/แท็กที่ปรากฏในข่าว: ${tags.slice(0, 8).join(", ")}`;
}

function noteScale(post: PostV2): string | null {
  const facts = scaleFacts(post);
  if (!facts.length) return null;
  return `- ขนาด/ขอบเขตตามตัวเลขในแหล่ง: ${facts.join(" · ")}`;
}

function noteGang(post: PostV2): string | null {
  const gang = specificGangName(post.gang_or_group || "") || "";
  const raw = (post.gang_or_group || "").trim();
  if (gang) return `- เครือข่าย/กลุ่มที่แหล่งระบุชื่อ: ${gang}`;
  if (raw && raw !== "-" && raw.length >= 6) return `- กลุ่มที่ปรากฏในฟิลด์: ${raw}`;
  return null;
}

function noteRelated(
  related: Array<{ id: string; title: string; relation: string }>,
): string {
  if (!related.length) {
    return "- ความเชื่อมโยง: ยังไม่พบสัญญาณร่วมที่ชัดกับคดีอื่นในชุดนี้ จึงไม่โยงเดา";
  }
  const why = related
    .map((r) => `${r.title} (${relPhrase(r.relation)}; id ${r.id})`)
    .join("; ");
  return `- ความเชื่อมโยงที่มีหลักฐานร่วม: ${why}`;
}

function noteImplication(post: PostV2): string {
  const status = post.status_th || mapStatus(post.case_stage) || "";
  const tags = (post.tags || []).join(" ");
  const topic = post.topic || "";
  if (/ติดตาม|หมายจับ|ยังไม่พบ/.test(status)) {
    return "- นัยปฏิบัติ: อาจต้องคงการติดตามตามหมาย/สถานะที่รายงาน และทบทวนเบาะแสซ้ำจากแหล่งเดิม";
  }
  if (/จับกุม|ฝากขัง|ส่งฟ้อง|ยื่นฟ้อง/.test(status)) {
    return "- นัยปฏิบัติ: มีแนวโน้มต้องคุมหลักฐานของกลางและคำให้การให้ครบก่อนขั้นสอบสวน/อัยการตามที่แหล่งระบุ";
  }
  if (/ไซเบอร์|ออนไลน์|พนัน|คอลเซ็นเตอร์|หลอก/.test(`${topic} ${tags}`)) {
    return "- นัยปฏิบัติ: อาจต้องขยายผลบัญชี/ช่องทางออนไลน์ที่ปรากฏในข่าว โดยยึดเฉพาะข้อเท็จจริงที่มีในแหล่ง";
  }
  if (/ยาเสพติด|ของกลาง/.test(`${topic} ${tags}`)) {
    return "- นัยปฏิบัติ: มีแนวโน้มต้องยืนยันห่วงโซ่ของกลางและเส้นทางขนส่งตามที่แหล่งรายงาน ไม่เติมเส้นทางที่ไม่มีในข่าว";
  }
  return "- นัยปฏิบัติ: ใช้เฉพาะข้อเท็จจริงในข่าวนี้เป็นฐานติดตาม ไม่สรุปตัวผู้ต้องหาเกินกว่าที่แหล่งระบุ";
}

export function buildAnalysisNotes(
  post: PostV2,
  related: Array<{ id: string; title: string; relation: string }> = [],
): string {
  const lines: string[] = [
    noteWhatHappened(post),
    noteActionStatus(post),
  ];
  const optional = [noteTagsMo(post), noteScale(post), noteGang(post)];
  for (const line of optional) {
    if (line) lines.push(line);
  }
  lines.push(
    noteRelated(related),
    noteImplication(post),
    "- จริยธรรม: ผู้ต้องหาตามข้อกล่าวหายังถือเป็นผู้บริสุทธิ์จนกว่าศาลจะมีคำพิพากษา และไม่เปิดเผยข้อมูลระบุตัวผู้เสียหายในคดีทางเพศ/ค้ามนุษย์/เด็ก",
  );
  // Keep 4–8 analytical bullets (+ ethics may make 9; trim soft extras first)
  while (lines.length > 8) {
    const dropIdx = lines.findIndex((l) => l.startsWith("- กลุ่มที่ปรากฏ") || l.startsWith("- เครือข่าย"));
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
