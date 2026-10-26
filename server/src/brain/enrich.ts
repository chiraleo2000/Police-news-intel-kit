import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  police_performance?: { units_involved?: string[]; outcome?: string };
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
  return out;
}

export function money(n: unknown): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "-";
  return `${Math.round(n).toLocaleString("th-TH")} บาท`;
}

/** Fill v2 fields without replacing content. */
export function enrichPost(post: PostV2, day: string): PostV2 {
  const content = typeof post.content === "string" ? post.content : "";
  const units = unitsOf(post);
  const provinces = Array.isArray(post.province) ? post.province.filter(Boolean) : [];
  const bureau = post.primary_bureau || mapBureau(units, `${post.title || ""} ${content.slice(0, 400)}`);
  const area = post.area || (provinces.length ? provinces.join(", ") : "-");
  const status = post.status_th || mapStatus(post.case_stage);
  const gang = post.gang_or_group || guessGang(post);
  const loss = post.stats?.loss_thb;
  const seized = post.stats?.seized_value_thb;
  let topicLead = "เหตุการณ์ที่ตำรวจ/หน่วยงานเกี่ยวข้อง";
  if (post.topic) topicLead = post.topic;
  const titleLead = post.title ? `เรื่องนี้เกี่ยวกับ${topicLead}` : "";
  const exec =
    post.exec_blurb ||
    [
      titleLead,
      provinces.length ? `พื้นที่หลักคือ ${provinces.join(", ")}` : "",
      `สถานะตามที่รายงาน: ${status}`,
      typeof loss === "number" && loss > 0 ? `มูลค่าความเสียหายที่แหล่งระบุ ${money(loss)}` : "",
      bureau && bureau !== "-" ? `หน่วยงานหลักที่โยงได้: ${bureau}` : "",
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/[「」]/g, "");

  const analysis =
    post.analysis_notes ||
    [
      `- ประเภทคดี: ${post.topic || "-"}`,
      `- พื้นที่: ${area}`,
      `- สถานะ: ${status}`,
      `- มูลค่าความเสียหาย: ${money(loss)} · ของกลาง/อายัด: ${money(seized)}`,
      `- ชื่อกลุ่ม/แก๊ง: ${gang}`,
      `- หน่วยงาน: ${units.length ? units.join(", ") : bureau}`,
      `- ระดับความรุนแรงที่ระบบจัด: ${post.severity || "-"} · การยืนยันแหล่ง: ${post.verification || "-"}`,
      "- ข้อสังเกตนี้สรุปจากฟิลด์ที่มีอยู่ ไม่ได้เพิ่มข้อเท็จจริงใหม่นอกแหล่งข่าว",
    ].join("\n");

  return {
    ...post,
    format_version: 2,
    primary_bureau: bureau,
    area,
    status_th: status,
    gang_or_group: gang,
    exec_blurb: exec,
    analysis_notes: analysis,
    related_cases: post.related_cases || [],
    references: post.references || referencesOf(post),
    _day: day,
  };
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

export function relatedHeuristic(
  post: PostV2,
  day: string,
  all: Array<{ day: string; post: PostV2 }>,
): Array<{ id: string; title: string; relation: string }> {
  const id = String(post.id || "");
  const topic = post.topic || "";
  const provinces = new Set((post.province || []).map(String));
  const gang = post.gang_or_group && post.gang_or_group !== "-" ? post.gang_or_group : "";
  const hits: Array<{ id: string; title: string; relation: string }> = [];
  for (const other of all) {
    const oid = String(other.post.id || "");
    if (!oid || oid === id) continue;
    const sameGang = gang && other.post.gang_or_group === gang;
    const prov = (other.post.province || []).some((p) => provinces.has(String(p)));
    const sameTopic = topic && other.post.topic === topic;
    const near = dayDistance(day, other.day) <= 14;
    if (sameGang || (prov && sameTopic && near)) {
      hits.push({
        id: oid,
        title: String(other.post.title || oid),
        relation: "related_to",
      });
    }
    if (hits.length >= 5) break;
  }
  return hits;
}
