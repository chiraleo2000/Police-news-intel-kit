/**
 * Case→case links. Keep a pair only when a human would call it the same
 * incident or a named follow-up of that incident.
 *
 * Allowed:
 *  1) Same specific operation / gang / site name (not generic crime words)
 *  2) Same district/venue within 3 days + one distinctive shared phrase
 *     (≥12 Thai chars, not date/unit/legal boilerplate)
 *
 * Cap 3 relations per post. Uncertain → no link.
 */
import type { PostV2 } from "./enrich.js";

export type CaseRel = { id: string; title: string; relation: string };

export type PlannedEdge = {
  a: string;
  b: string;
  score: number;
  via: string;
  follow: boolean;
};

const REL_CAP = 3;

const PLACE_NICKS = [
  "หาดใหญ่",
  "พัทยา",
  "ลาดพร้าว",
  "สายไหม",
  "ห้วยขวาง",
  "ประตูน้ำ",
  "ป่าตอง",
  "คลองสำโรง",
  "บางพลี",
  "ทองผาภูมิ",
  "หนองจิก",
  "ชะอวด",
  "เชียงดาว",
  "เยาวราช",
  "กระทุ่มแบน",
  "สัตหีบ",
  "แม่สะเรียง",
  "เกาะสมุย",
  "บางนา",
  "วังทองหลาง",
  "บ้านบึง",
  "ท่าศาลา",
  "สะเดา",
  "ศรีสำโรง",
  "ปากเกร็ด",
  "กำแพงแสน",
  "บางละมุง",
  "บางเสาธง",
  "บางกรวย",
  "โชคชัย",
  "พระโขนง",
  "ปลวกแดง",
  "จอมเทียน",
  "เขาย้อย",
  "วังวิเศษ",
  "ปะเหลียน",
  "ระโนด",
  "ทุ่งสง",
  "ควนขนุน",
  "นาแก",
  "แม่ระมาด",
  "นิคมคำสร้อย",
  "หัวหมาก",
  "บางใหญ่",
  "วิชิต",
  "ห้วยยอด",
  "นาบอน",
  "ฉลอง",
  "ถลาง",
  "กะทู้",
  "สาคู",
  "ภาษีเจริญ",
  "เสน่หานุสรณ์",
  "สมิหลา",
  "บางแก้ว",
  "เขารูปช้าง",
  "รัถการ",
];

/** Latin tokens that mark a named site/product/campaign — never alone as a link. */
const LATIN_STOP = new Set([
  "police",
  "arrested",
  "arrest",
  "drug",
  "drugs",
  "million",
  "baht",
  "online",
  "thailand",
  "department",
  "officials",
  "official",
  "suspect",
  "court",
  "prison",
  "years",
  "home",
  "faces",
  "after",
  "issued",
  "summons",
  "woman",
  "visa",
  "server",
  "media",
  "attack",
  "critical",
  "scam",
  "gang",
  "nurse",
  "retired",
  "over",
  "with",
  "that",
  "this",
  "from",
  "have",
  "been",
  "were",
  "into",
  "more",
  "than",
  "only",
  "three",
  "items",
  "remaining",
  "opening",
  "safe",
  "reveals",
  "caught",
  "escape",
  "owner",
  "afraid",
  "theft",
  "behaviour",
  "behavior",
  "complaints",
  "about",
  "targeting",
  "posing",
  "defrauding",
  "alerts",
  "command",
  "without",
  "authentication",
  "national",
  "immigration",
  "factory",
  "bangkok",
  "hotel",
  "room",
  "notice",
  "rednotice",
  "red",
  "thaicert",
  "nginx",
  "mariadb",
  "vulnerability",
  "gitlab",
  "crypto",
  "bitcoin",
  "bitkub",
]);

const FOLLOW_MARKERS = [
  "ขยายผล",
  "ฝากขัง",
  "สั่งฟ้อง",
  "ยื่นฟ้อง",
  "ศาลสั่ง",
  "ความคืบหน้า",
  "ออกหมายเรียก",
  "ประกาศช่วย",
  "ไม่พบตัว",
  "ยังไม่พบ",
  "มอบตัว",
  "แจ้งเพิ่ม",
  "นัดพิพากษา",
  "ส่งฟ้อง",
  "เข้าพบตำรวจแล้ว",
];

const BROAD_UNIT_EXACT = new Set([
  "ตำรวจ",
  "ทหาร",
  "ฝ่ายปกครอง",
  "ตร",
  "สตช",
  "สำนักงานตำรวจแห่งชาติ",
  "ตำรวจในพื้นที่",
  "หน่วยงานความมั่นคงบูรณาการ",
  "พิสูจน์หลักฐาน",
  "สตม",
  "ตม",
  "บกทล",
  "ตำรวจทางหลวง",
  "ตำรวจท่องเที่ยว",
  "กองบัญชาการตำรวจท่องเที่ยว",
  "thaicert",
  "dsi",
  "ดีเอสไอ",
]);

const GENERIC_GANG = [
  "เว็บพนัน",
  "คอลเซ็นเตอร์",
  "แก๊งคอลเซ็นเตอร์",
  "แก๊งสแกม",
  "เครือข่ายใหญ่",
  "ขยายผลเครือข่าย",
  "ยาเสพติด",
  "จับกุม",
  "โปรด",
  "เว็บพนันออนไลน์",
  "เว็บพนันต่างประเทศ",
];

const GENERIC_OPS = [
  "ตรวจที่เกิดเหตุ",
  "เก็บหลักฐาน",
  "จับกุมตามหมาย",
  "สอบสวน",
  "รวบรวมพยาน",
  "ลงพื้นที่",
  "ประชุม",
  "ตรวจเยี่ยม",
  "ให้ความรู้",
  "ลาดตระเวน",
  "ติดตามตัว",
  "ตรวจสอบ",
  "ออกประกาศ",
  "N/A",
];

/** Product / MO words that co-occur across unrelated busts. */
const GENERIC_MARKERS = new Set([
  "พอตเค",
  "พอตซอมบี้",
  "ยาบ้า",
  "ไอซ์",
  "กัญชา",
  "เฮโรอีน",
  "คอลเซ็นเตอร์",
  "เว็บพนัน",
  "หมายแดง",
  "rednotice",
  "ไนตรัส",
  "แก๊สหัวเราะ",
  "ต่างด้าว",
  "เหรียญดิจิทัล",
  "คริปโต",
]);

const PHRASE_JUNK = [
  "ตุลาคม",
  "เมื่อวัน",
  "รายงาน",
  "เจ้าหน้าที่",
  "ตำรวจ",
  "ผู้ต้องหา",
  "ให้การ",
  "ข้อกล่าว",
  "พนักงาน",
  "สอบสวน",
  "เดลินิว",
  "ไทยรัฐ",
  "แนวหน้า",
  "อมรินทร์",
  "สำนักงาน",
  "กองบัญชา",
  "เผยแพร่",
  "ตามที่",
  "ผู้บริสุทธิ์",
  "พิพากษา",
  "จนกว่าศาล",
  "ศาลจะมีคำพิพากษา",
  "ประชาสัมพันธ์",
  "ผู้บัญชา",
  "ปฏิบัติหน้าที่",
  "ความปลอดภัย",
  "น้อมรำลึก",
  "พระมหา",
  "สมเด็จ",
  "พวงมาลา",
  "บำเพ็ญ",
  "ข้าราชการ",
  "สารนิเทศ",
  "เว็บไซต์",
  "แหล่งข่าว",
  "ตรวจสอบ",
  "ควบคุมตัว",
  "ดำเนินคดี",
  "หมายจับ",
  "หมายค้น",
  "ยาเสพติด",
  "เว็บพนัน",
  "คอลเซ็นเตอร์",
  "กล้องวงจร",
  "นักท่องเที่ยว",
  "จับกุม",
  "ตรวจค้น",
  "อินเตอร์โพล",
  "rednotice",
  "หมายแดง",
  "ติดตามตัว",
  "แห่งหนึ่งใน",
  "หนึ่งในเมือง",
  "ปราบปรามยา",
  "ช่องทางไล",
  "ภัยออนไล",
  "ออนไลน์",
  "ต่างด้าว",
  "ข้ามชาติ",
  "บัญชีม้า",
  "เส้นทางเงิ",
  "หลบหนีหมาย",
  "เป้าหมายตาม",
  "ข้อมูลทะเบ",
  "ทำร้ายร่าง",
  "แอบอ้างเป็",
  "เด็กและเยาว",
  "ลักลอบเข้า",
  "ของกลางที่",
  "มูลค่าความ",
  "อยู่ระหว่าง",
  "ยังไม่พบ",
  "ในที่สาธารณะ",
  "โดยไม่ได้รับ",
  "เสียหายกว่า",
  "ล้านบาท",
  "ถูกจ้างส่ง",
  "ส่งพัสดุ",
  "ลักทรัพย์ใน",
  "เยี่ยมบำรุง",
  "บำรุงขวัญ",
  "เบี้ยเลี้ยง",
  "ปรับลดเบี้ย",
  "ตลอด24ชั่ว",
  "สุวรรณภูมิ",
  "สนามบินสุว",
  "เตือนภัยไซ",
  "เตือนช่องโห",
  "เสี่ยงถูกควบ",
  "งานต่างประเทศ",
  "ยิงผู้บุกรุก",
  "อุบัติเหตุทาง",
  "ข้าเมืองแม่น้ำ",
  "เมืองแม่น้ำโขง",
  "สกัดจับขบวน",
  "ต่างด้าวผิดกฎ",
  "รวบนักธุรกิจ",
  "ผู้ร้ายข้ามแ",
  "จดจำใบหน้า",
  "ท่องเที่ยวai",
  "ไนตรัสออกไซ",
  "ตรวจค้นคอนโด",
  "เหรียญดิจิทั",
  "พอตเค",
  "วันที่",
];

type CaseNode = {
  id: string;
  day: string;
  title: string;
  topic: string;
  units: string[];
  gangSpec: string;
  opSpec: string;
  opRaw: string;
  signal: string;
  lead: string;
  markers: Set<string>;
  districts: Set<string>;
  stations: Set<string>;
  numberedUnits: string[];
};

function compact(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\u0e00-\u0e7fa-z0-9]+/g, "");
}

function dayDistance(leftDay: string, rightDay: string): number {
  const da = Date.parse(leftDay);
  const db = Date.parse(rightDay);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 999;
  return Math.abs(da - db) / 86_400_000;
}

export function relPhrase(relation: string): string {
  if (relation === "follow_up_of") return "ข่าวติดตาม";
  if (relation === "related_to") return "เรื่องเดียวกัน";
  if (relation === "similar_mo") return "รูปแบบคล้าย";
  if (relation === "same_network") return "เครือข่ายเดียวกัน";
  if (relation === "same_unit_ops") return "หน่วยปฏิบัติการเดียวกัน";
  return relation;
}

/** Named network worth a case→case link. Generic labels are rejected. */
export function specificGangName(g: string): string {
  const s = String(g || "").trim();
  if (!s || s === "-" || s.length < 12) return "";
  if (GENERIC_GANG.some((x) => s === x || s.startsWith(x))) return "";
  if (
    !(
      s.includes("แก๊ง") ||
      s.includes("เครือข่าย") ||
      s.includes("เว็บ") ||
      s.includes("ปฏิบัติการ") ||
      s.includes("ยุทธการ")
    )
  ) {
    return "";
  }
  // Still reject bare "เว็บพนัน…" labels even when length ≥ 12
  if (s.startsWith("เว็บพนัน") && s.length < 18) return "";
  if (s === "เว็บพนันออนไลน์" || s === "เว็บพนันต่างประเทศ") return "";
  return s;
}

function isBroadUnit(compacted: string): boolean {
  if (BROAD_UNIT_EXACT.has(compacted)) return true;
  if (compacted.startsWith("บช") && compacted.length <= 6) return true;
  if (/^ภ\d+$/.test(compacted)) return true;
  return false;
}

function stripTrailingDots(s: string): string {
  let out = s;
  while (out.endsWith(".")) out = out.slice(0, -1);
  return out;
}

function normUnit(u: string): string {
  let n = u.replaceAll(/\s+/g, "");
  n = n.replaceAll("กองบังคับการ", "บก.");
  n = n.replaceAll("กองกำกับการ", "กก.");
  n = n.replaceAll("กองร้อยตำรวจตระเวนชายแดนที่", "ตชด.");
  n = n.replaceAll("กองร้อยตชด.", "ตชด.");
  n = n.replaceAll("กองร้อยตชด", "ตชด.");
  n = n.replaceAll("ร้อย.ตชด.", "ตชด.");
  n = n.replaceAll("ร้อยตชด.", "ตชด.");
  n = n.replaceAll("ร้อยตชด", "ตชด.");
  return stripTrailingDots(n);
}

function coreUnit(u: string): string {
  const n = normUnit(u);
  if (n.startsWith("บก.") || n.startsWith("กก.")) return n.slice(3);
  return n;
}

function startsWithDigit(s: string): boolean {
  if (!s.length) return false;
  const cp = s.codePointAt(0);
  return cp !== undefined && cp >= 48 && cp <= 57;
}

function unitsPairMatch(x: string, y: string): boolean {
  if (x === y) return true;
  const cx = coreUnit(x);
  const cy = coreUnit(y);
  if (cx.length >= 4 && cx === cy) return true;
  const shorter = x.length <= y.length ? x : y;
  const longer = x.length <= y.length ? y : x;
  if (shorter.length < 6 || !longer.includes(shorter)) return false;
  const rest = longer.slice(longer.indexOf(shorter) + shorter.length);
  return !(rest.length > 0 && startsWithDigit(rest));
}

function unitsOverlap(leftUnits: string[], rightUnits: string[]): boolean {
  const A = leftUnits.map(normUnit).filter((n) => n.length >= 5 && !isBroadUnit(compact(n)));
  const B = rightUnits.map(normUnit).filter((n) => n.length >= 5 && !isBroadUnit(compact(n)));
  for (const x of A) {
    for (const y of B) {
      if (unitsPairMatch(x, y)) return true;
    }
  }
  return false;
}

function stationNames(units: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of units) {
    const n = normUnit(raw);
    const m = /(?:สภ|สน)\.?([ก-๙].+)/.exec(n);
    if (m && m[1].length >= 4) out.add(m[1]);
  }
  return out;
}

function districtsOf(text: string, provinces: Set<string>): Set<string> {
  const out = new Set<string>();
  const re = /(?:อำเภอ|อ\.|เขต|ตำบล|ต\.)\s*([ก-๙]{3,24})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1];
    if (name === "เมือง" || name.length < 4 || provinces.has(name)) continue;
    out.add(name);
  }
  const c = compact(text);
  for (const nick of PLACE_NICKS) {
    if (provinces.has(nick)) continue;
    if (c.includes(compact(nick))) out.add(nick);
  }
  return out;
}

const LATIN_EDGE_PUNCT = new Set([".", "_", "-"]);
const LATIN_TLDS = new Set(["com", "net", "org", "io", "co", "th"]);

function stripLatinEdgePunct(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && LATIN_EDGE_PUNCT.has(s[start]!)) start += 1;
  while (end > start && LATIN_EDGE_PUNCT.has(s[end - 1]!)) end -= 1;
  return s.slice(start, end);
}

function stripKnownTld(token: string): string {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return token;
  const tld = token.slice(dot + 1).toLowerCase();
  if (!LATIN_TLDS.has(tld)) return token;
  return token.slice(0, dot);
}

function normalizeLatinToken(raw: string): string | null {
  let token = stripLatinEdgePunct(raw);
  token = stripKnownTld(token);
  if (token.length < 5 || LATIN_STOP.has(token)) return null;
  if (![...token].some((c) => c >= "a" && c <= "z")) return null;
  return token;
}

function latinTokens(text: string): string[] {
  const out: string[] = [];
  const re = /[a-z][a-z0-9._-]*/g;
  const lower = text.toLowerCase();
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower))) {
    const token = normalizeLatinToken(m[0]);
    if (token && !out.includes(token)) out.push(token);
  }
  return out;
}

const QUOTE_CHARS = new Set(['"', "\u201c", "\u201d", "'", "\u2018", "\u2019", "«", "»", "“", "”"]);

function readQuotedSpan(text: string, openAt: number): { quote: string; next: number } | null {
  const start = openAt + 1;
  let j = start;
  while (j < text.length && j - start <= 48 && text[j] !== "\n" && !QUOTE_CHARS.has(text[j])) {
    j++;
  }
  if (j >= text.length || !QUOTE_CHARS.has(text[j])) return null;
  return { quote: text.slice(start, j).trim(), next: j + 1 };
}

function quotesIn(text: string): string[] {
  const out: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    if (!QUOTE_CHARS.has(text[pos])) {
      pos++;
      continue;
    }
    const span = readQuotedSpan(text, pos);
    if (!span) {
      pos++;
      continue;
    }
    if (span.quote.length >= 4 && !out.includes(span.quote)) out.push(span.quote);
    pos = span.next;
  }
  return out;
}

const PHRASE_SOFT = [
  "ตรวจค้น",
  "คอนโด",
  "พวงมาลา",
  "บำเพ็ญ",
  "น้อมรำลึก",
  "พิธี",
  "อุบัติเหตุ",
  "บัติเหตุ",
  "บุกทลาย",
  "ลักทรัพย์",
  "หมายจับ",
  "หมายค้น",
  "จับกุม",
  "ผู้ต้องหา",
  "ยาเสพติด",
  "เว็บพนัน",
  "ออนไลน์",
  "ล้านบาท",
  "ต่างด้าว",
  "เตือนภัย",
  "ช่องโหว่",
  "สุวรรณภูมิ",
  "สนามบิน",
  "เบี้ยเลี้ย",
  "บำรุงขวัญ",
  "เยี่ยมบำรุ",
  "ผู้ร้ายข้าม",
  "rednotice",
];

function isJunkPhrase(w: string): boolean {
  if (!w || w.length < 12) return true;
  if (/^\d+$/.test(w)) return true;
  if (w.includes("1386") || w.includes("1155") || w.includes("1441")) return true;
  if (GENERIC_MARKERS.has(w)) return true;
  if (PHRASE_JUNK.some((s) => w.includes(s) || (s.length >= 8 && s.includes(w)))) return true;
  // Truncated sliding windows still carry procedural stems.
  if (PHRASE_SOFT.some((s) => w.includes(s))) return true;
  return false;
}

/** True when the shared string is basically only a place label. */
function phraseIsMostlyPlace(w: string, places: string[]): boolean {
  let rest = w;
  for (const pl of [...places, ...PLACE_NICKS]) {
    const pc = compact(pl);
    if (pc.length >= 4) rest = rest.replaceAll(pc, "");
  }
  // Strip province-ish leftovers
  rest = rest.replace(/จังหวัด|อำเภอ|เขต|ตำบล|กรุงเทพ|ปัตตานี|พัทลุง|สงขลา|ชลบุรี/g, "");
  return rest.length < 4;
}

function isCeremonyText(s: string): boolean {
  return /พิธี|น้อมรำลึก|บำเพ็ญกุศล|พวงมาลา|วางพวง/.test(s);
}

function operationOf(post: PostV2): string {
  const op = String(post.police_performance?.operation || "").trim();
  if (!op || op === "N/A" || op === "-" || op.length < 10) return "";
  if (isCeremonyText(op)) return "";
  if (GENERIC_OPS.some((g) => op === g || (op.length < 24 && op.includes(g)))) return "";
  // Keep named campaigns even when short-ish (BLACK TRACE, ตัดเนื้อร้าย…)
  if (/[A-Za-z]{4,}/.test(op) || /ตัดเนื้อร้าย|ยุทธการ|ปฏิบัติการ\s*[A-Za-zก-๙]{4,}/.test(op)) {
    return op;
  }
  if (op.length < 18) return "";
  if (GENERIC_OPS.some((g) => op.includes(g))) return "";
  return op;
}

function headlineOf(post: PostV2): string {
  const tags = (post.tags || []).filter((t) => /[A-Za-z0-9]/.test(t) || t.length >= 8).join(" ");
  return `${post.title || ""} ${operationOf(post)} ${tags}`.trim();
}

function numberedUnitsIn(text: string, units: string[]): string[] {
  const out: string[] = [];
  const hay = compact(text);
  for (const u of units) {
    const n = normUnit(u);
    if (!/\d/.test(n)) continue;
    const c = compact(n);
    if (c.length < 5) continue;
    if (hay.includes(c) && !out.includes(n)) out.push(n);
  }
  // Also catch bare forms in title like ตชด.437 even if unit list differs
  const bare = text.match(/(?:ตชด|บก\.?ปปส|กก\.?ดส|ร้อย\.?ตชด)\.?\s*\d{2,4}/gi) || [];
  for (const b of bare) {
    const n = stripTrailingDots(b.replace(/\s+/g, ""));
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

function addLatinMarkers(out: Set<string>, signal: string) {
  // latinTokens already drops LATIN_STOP and tokens shorter than 5
  for (const t of latinTokens(signal)) out.add(`lat:${t}`);
}

function addQuoteMarkers(out: Set<string>, signal: string) {
  for (const q of quotesIn(signal)) {
    const c = compact(q);
    if (c.length >= 6 && !isJunkPhrase(c) && !GENERIC_MARKERS.has(q.trim())) {
      out.add(`q:${c}`);
    }
  }
}

function addNickMarkers(out: Set<string>, post: PostV2) {
  const blob = `${post.title || ""} ${String(post.content || "").slice(0, 400)}`;
  const nick = /(?:เจ๊|พี่|น้อง)?[ก-๙]{2,12}\s*คนละยำ|[ก-๙]{2,8}(?:ซอมบี้)/.exec(blob);
  if (nick) out.add(`nick:${compact(nick[0])}`);
  if (/je\s*beer|คนละยำ|เจ๊เบียร์/i.test(blob)) out.add("nick:jebeer");
}

/** Distinctive named markers for identity matching. */
function extractMarkers(post: PostV2, signal: string): Set<string> {
  const out = new Set<string>();
  addLatinMarkers(out, signal);
  addQuoteMarkers(out, signal);
  const gang = specificGangName(post.gang_or_group || "");
  if (gang) out.add(`gang:${compact(gang)}`);
  const op = operationOf(post);
  if (op) {
    const oc = compact(op);
    if (/[a-z]{4,}/.test(oc) || oc.length >= 16) out.add(`op:${oc}`);
  }
  addNickMarkers(out, post);
  return out;
}

function buildNodes(rows: Array<{ day: string; post: PostV2 }>): { nodes: CaseNode[]; provinces: string[] } {
  const byId = new Map<string, { day: string; posts: PostV2[] }>();
  const provinceSet = new Set<string>();
  for (const row of rows) {
    const id = String(row.post.id || "").trim();
    if (!id) continue;
    for (const p of row.post.province || []) if (p) provinceSet.add(String(p));
    const cur = byId.get(id);
    if (cur) cur.posts.push(row.post);
    else byId.set(id, { day: row.day, posts: [row.post] });
  }
  const provinces = [...provinceSet];
  const nodes: CaseNode[] = [];
  for (const [id, bag] of byId) {
    nodes.push(nodeFromBag(id, bag, provinceSet));
  }
  return { nodes, provinces };
}

function nodeFromBag(
  id: string,
  bag: { day: string; posts: PostV2[] },
  provinceSet: Set<string>,
): CaseNode {
  const posts = bag.posts;
  const titles = posts.map((p) => p.title || "");
  titles.sort((a, b) => b.length - a.length);
  const title = titles[0] || id;
  const topic = posts.find((p) => p.topic)?.topic || "";
  const units = [...new Set(posts.flatMap((p) => (p.police_performance?.units_involved || []).map(String)))];
  const gangSpec = posts.map((p) => specificGangName(p.gang_or_group || "")).find(Boolean) || "";
  const ops = posts.map((p) => operationOf(p));
  ops.sort((a, b) => b.length - a.length);
  const opRaw = ops[0] || "";
  const signal = posts.map(headlineOf).join(" ");
  const lead = posts.map((p) => String(p.content || "").slice(0, 480)).join(" ");
  const markers = new Set<string>();
  for (const p of posts) {
    for (const m of extractMarkers(p, headlineOf(p))) markers.add(m);
  }
  return {
    id,
    day: bag.day,
    title,
    topic,
    units,
    gangSpec,
    opSpec: opRaw ? compact(opRaw) : "",
    opRaw,
    signal,
    lead,
    markers,
    districts: districtsOf(`${signal} ${lead}`, provinceSet),
    stations: stationNames(units),
    numberedUnits: numberedUnitsIn(`${title} ${signal}`, units),
  };
}

function markerDf(nodes: CaseNode[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const node of nodes) {
    for (const m of node.markers) df.set(m, (df.get(m) || 0) + 1);
  }
  return df;
}

function intersect(left: Set<string>, right: Set<string>): string[] {
  const out: string[] = [];
  for (const x of left) if (right.has(x)) out.push(x);
  return out;
}

function laterByDay(left: CaseNode, right: CaseNode): CaseNode | null {
  if (left.day > right.day) return left;
  if (right.day > left.day) return right;
  return null;
}

function collectPhrasesAtLen(
  short: string,
  long: string,
  n: number,
  seen: Set<string>,
  hits: string[],
): boolean {
  for (let i = 0; i + n <= short.length; i++) {
    const w = short.slice(i, i + n);
    if (seen.has(w) || !long.includes(w) || isJunkPhrase(w)) continue;
    if (hits.some((h) => h.includes(w))) continue;
    seen.add(w);
    hits.push(w);
    if (hits.length >= 6) return true;
  }
  return false;
}

/** Longest common compact substrings ≥ minLen, collapsed. */
function sharedDistinctPhrases(left: string, right: string, minLen = 12): string[] {
  const a = compact(left);
  const b = compact(right);
  if (a.length < minLen || b.length < minLen) return [];
  const hits: string[] = [];
  const seen = new Set<string>();
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  for (let n = Math.min(28, short.length); n >= minLen; n--) {
    if (collectPhrasesAtLen(short, long, n, seen, hits)) return hits;
    if (hits.length) break; // take longest tier only
  }
  return hits;
}

function phraseDf(nodes: CaseNode[], phrases: string[]): number {
  // Approximate rarity: count nodes whose compact signal contains the phrase
  let count = 0;
  for (const node of nodes) {
    const c = compact(node.signal);
    if (phrases.some((p) => c.includes(p))) count++;
  }
  return count;
}

function sharedRareMarkers(
  left: CaseNode,
  right: CaseNode,
  df: Map<string, number>,
): string[] {
  const out: string[] = [];
  for (const m of left.markers) {
    if (!right.markers.has(m)) continue;
    const d = df.get(m) || 0;
    // Must be rare across corpus (same named site/op, not a ubiquitous token)
    if (d < 2 || d > 4) continue;
    // Reject generic product markers encoded as quotes
    if (m.startsWith("q:") && GENERIC_MARKERS.has(m.slice(2))) continue;
    if (m.startsWith("lat:") && LATIN_STOP.has(m.slice(4))) continue;
    out.push(m);
  }
  return out;
}

type ScoreAcc = { score: number; why: string[] };

function addNamedIdentity(left: CaseNode, right: CaseNode, acc: ScoreAcc, df: Map<string, number>) {
  if (left.gangSpec && left.gangSpec === right.gangSpec) {
    acc.score += 100;
    acc.why.push(`gang:${left.gangSpec}`);
  }
  if (left.opSpec && left.opSpec.length >= 12 && left.opSpec === right.opSpec) {
    acc.score += 96;
    acc.why.push(`operation:${left.opRaw}`);
  }
  const rare = sharedRareMarkers(left, right, df).filter(
    (m) => !(m.startsWith("lat:") && /shell|nginx|mariadb|php|cve/.test(m)),
  );
  if (rare.length) {
    acc.score += 92;
    acc.why.push(`name:${rare.slice(0, 2).join("+")}`);
  }
}

function addNumberedUnitPlace(
  left: CaseNode,
  right: CaseNode,
  places: string[],
  sameTopic: boolean,
  day: number,
  acc: ScoreAcc,
) {
  const sharedNumbered = left.numberedUnits.filter((u) =>
    right.numberedUnits.some((v) => unitsPairMatch(normUnit(u), normUnit(v))),
  );
  if (!sharedNumbered.length || !places.length || !sameTopic || day > 5) return;
  acc.score += 90;
  acc.why.push(`numbered-unit+place:${sharedNumbered[0]}/${places[0]}`);
}

function addSharedNick(left: CaseNode, right: CaseNode, sameTopic: boolean, day: number, acc: ScoreAcc) {
  const nickLeft = [...left.markers].filter((m) => m.startsWith("nick:"));
  const nickRight = new Set([...right.markers].filter((m) => m.startsWith("nick:")));
  const sharedNick = nickLeft.find((m) => nickRight.has(m));
  if (!sharedNick || !sameTopic || day > 7) return;
  acc.score += 94;
  acc.why.push(sharedNick);
}

function addPlacePhrase(
  left: CaseNode,
  right: CaseNode,
  ctx: {
    places: string[];
    stations: string[];
    sameTopic: boolean;
    day: number;
    units: boolean;
    allNodes: CaseNode[];
  },
  acc: ScoreAcc,
) {
  if (acc.score >= 80 || ctx.day > 3 || !ctx.sameTopic) return;
  if (!ctx.places.length && !ctx.stations.length) return;
  const phrases = sharedDistinctPhrases(
    `${left.title} ${left.signal}`,
    `${right.title} ${right.signal}`,
    12,
  ).filter((p) => !isJunkPhrase(p) && !phraseIsMostlyPlace(p, ctx.places));
  const rarePhrase = phrases.find((p) => {
    const d = phraseDf(ctx.allNodes, [p]);
    return d >= 2 && d <= 3;
  });
  if (!rarePhrase || !(ctx.units || ctx.stations.length > 0)) return;
  acc.score += 85;
  acc.why.push(`place+phrase:${ctx.places[0] || ctx.stations[0]}:${rarePhrase}`);
}

function decide(
  left: CaseNode,
  right: CaseNode,
  df: Map<string, number>,
  allNodes: CaseNode[],
): { score: number; via: string; follow: boolean } | null {
  if (isCeremonyText(left.title) || isCeremonyText(right.title)) return null;

  const day = dayDistance(left.day, right.day);
  const places = intersect(left.districts, right.districts);
  const stations = intersect(left.stations, right.stations);
  const sameTopic = !!(left.topic && left.topic === right.topic);
  const units = unitsOverlap(left.units, right.units);
  const acc: ScoreAcc = { score: 0, why: [] };

  addNamedIdentity(left, right, acc, df);
  addNumberedUnitPlace(left, right, places, sameTopic, day, acc);
  addSharedNick(left, right, sameTopic, day, acc);
  addPlacePhrase(left, right, { places, stations, sameTopic, day, units, allNodes }, acc);

  if (acc.score < 80 || !acc.why.length) return null;

  const later = laterByDay(left, right);
  const follow = !!later && FOLLOW_MARKERS.some((m) => later.title.includes(m));
  return { score: acc.score, via: acc.why.join("; "), follow };
}

function collectEdges(nodes: CaseNode[], df: Map<string, number>): PlannedEdge[] {
  const found: PlannedEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = decide(nodes[i], nodes[j], df, nodes);
      if (!d) continue;
      const left = nodes[i].id < nodes[j].id ? nodes[i] : nodes[j];
      const right = left === nodes[i] ? nodes[j] : nodes[i];
      found.push({ a: left.id, b: right.id, score: d.score, via: d.via, follow: d.follow });
    }
  }
  found.sort((x, y) => y.score - x.score || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  return found;
}

function capEdges(found: PlannedEdge[]): PlannedEdge[] {
  const deg = new Map<string, number>();
  const kept: PlannedEdge[] = [];
  for (const e of found) {
    const da = deg.get(e.a) || 0;
    const db = deg.get(e.b) || 0;
    if (da >= REL_CAP || db >= REL_CAP) continue;
    kept.push(e);
    deg.set(e.a, da + 1);
    deg.set(e.b, db + 1);
  }
  return kept;
}

function pushRelatedPair(rels: Map<string, CaseRel[]>, a: CaseNode, b: CaseNode) {
  rels.get(a.id)?.push({ id: b.id, title: b.title, relation: "related_to" });
  rels.get(b.id)?.push({ id: a.id, title: a.title, relation: "related_to" });
}

function pushFollowPair(rels: Map<string, CaseRel[]>, later: CaseNode, earlier: CaseNode) {
  rels.get(later.id)?.push({ id: earlier.id, title: earlier.title, relation: "follow_up_of" });
  rels.get(earlier.id)?.push({ id: later.id, title: later.title, relation: "related_to" });
}

function dedupeRelLists(rels: Map<string, CaseRel[]>) {
  for (const list of rels.values()) {
    const seen = new Set<string>();
    const dedup: CaseRel[] = [];
    list.sort((x, y) => x.id.localeCompare(y.id));
    for (const r of list) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      dedup.push(r);
    }
    list.length = 0;
    list.push(...dedup);
  }
}

function materializeRels(nodes: CaseNode[], kept: PlannedEdge[]): Map<string, CaseRel[]> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rels = new Map<string, CaseRel[]>();
  for (const n of nodes) rels.set(n.id, []);
  for (const e of kept) {
    const A = byId.get(e.a);
    const B = byId.get(e.b);
    if (!A || !B) continue;
    const later = e.follow ? laterByDay(A, B) : null;
    if (later) pushFollowPair(rels, later, later === A ? B : A);
    else pushRelatedPair(rels, A, B);
  }
  dedupeRelLists(rels);
  return rels;
}

export function planCaseRelations(rows: Array<{ day: string; post: PostV2 }>): {
  rels: Map<string, CaseRel[]>;
  edges: PlannedEdge[];
} {
  const { nodes } = buildNodes(rows);
  const df = markerDf(nodes);
  const found = collectEdges(nodes, df);
  const kept = capEdges(found);
  return { rels: materializeRels(nodes, kept), edges: kept };
}
