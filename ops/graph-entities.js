/**
 * Named entities and Thai edge labels for the published graph.
 * Conservative: only strings that already appear in the post. No bare role words.
 */
const THAI_REL = {
  investigated_by: "สืบสวนโดย",
  arrested_by: "จับโดย",
  ordered_by: "สั่งการโดย",
  announced_by: "แจ้งโดย",
  targets_network: "เป้าหมายเครือข่าย",
  located_in: "เกิดที่",
  area: "เกิดที่",
  related_to: "เกี่ยวข้องกับ",
  follow_up_of: "ติดตามจาก",
  person: "เกี่ยวข้องกับบุคคล",
  suspect: "ผู้ต้องหา",
  account: "บัญชี",
  bank: "บัญชี",
  mule: "บัญชี",
};

const WEAK_LABELS = new Set(["", "mentions", "mention", "link", "see", "related", "ref"]);

const GENERIC_NETWORK = [
  "เว็บพนัน",
  "คอลเซ็นเตอร์",
  "แก๊งคอลเซ็นเตอร์",
  "แก๊งสแกม",
  "แก๊งสแกมเมอร์",
  "เครือข่ายใหญ่",
  "ขยายผลเครือข่าย",
  "ยาเสพติด",
  "จับกุม",
  "โปรด",
  "เว็บพนันออนไลน์",
  "เว็บพนันต่างประเทศ",
  "เว็บพนันออนไลน์ต่างชาติ",
];

const BARE = new Set([
  "ตำรวจ",
  "เจ้าหน้าที่",
  "ผู้ต้องหา",
  "ผู้เสียหาย",
  "ประชาชน",
  "ผู้บัญชาการ",
  "นาย",
  "นาง",
]);

const STOP_GIVEN = new Set([
  "อำเภอ",
  "กรัฐมนตรี",
  "จ้าง",
  "หน้า",
  "ทุน",
  "ตำรวจ",
  "ความ",
  "ท้าย",
  "ตรวจ",
  "สมาคม",
  "เจ้า",
  "เข้า",
  "วาง",
  "ที่",
  "คือ",
  "และ",
  "รอง",
  "ของ",
  "ใน",
  "ให้",
  "จาก",
  "ร่วม",
  "ผู้",
  "ซึ่ง",
  "เป็น",
  "ได้",
  "แล้ว",
  "นี้",
  "นั้น",
  "กับ",
  "หรือ",
  "แต่",
  "ไม่",
  "จะ",
  "มา",
  "ไป",
  "อยู่",
  "ว่า",
  "ตาม",
  "โดย",
  "เพื่อ",
  "แห่ง",
  "การ",
  "ระบบ",
  "ยศ",
  "ใหญ่",
  "ราย",
  "หนึ่ง",
  "งาน",
  "ก",
  "ตรวจคน",
  "หน้างาน",
]);

const STOP_SUR = new Set([
  "เป็น",
  "ของ",
  "และ",
  "ให้",
  "ใน",
  "ที่",
  "จาก",
  "ร่วม",
  "ผู้",
  "จังหวัด",
  "ตำรวจ",
  "อำเภอ",
  "แล้ว",
  "ได้",
  "ว่า",
  "ซึ่ง",
  "โดย",
  "เพื่อ",
  "กับ",
  "หรือ",
  "การ",
  "ความ",
]);

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
  "ห้วยยอด",
  "นาบอน",
  "ฉลอง",
  "ถลาง",
  "กะทู้",
  "ภาษีเจริญ",
  "บางแก้ว",
  "เขารูปช้าง",
];

// Split so each alternation stays under Sonar's regex complexity limit.
const STOP_ACCOUNT_A = /facebook|youtube|google|instagram|twitter|tiktok|line\.me|thairath/i;
const STOP_ACCOUNT_B = /mgronline|khaosod|matichon|dailynews|bangkokpost|thethaiger|sanook/i;
const STOP_ACCOUNT_C = /thaipbs|amarintv|thaipost|wikipedia|antifakenews|microsoft|apple\.com|bitkub/i;

function isStopAccount(value) {
  return STOP_ACCOUNT_A.test(value) || STOP_ACCOUNT_B.test(value) || STOP_ACCOUNT_C.test(value);
}

const STOP_BRAND = new Set([
  "facebook",
  "youtube",
  "google",
  "instagram",
  "twitter",
  "tiktok",
  "line",
  "telegram",
  "thailand",
  "thaicert",
  "meta",
  "dsi",
  "online",
  "website",
  "https",
  "http",
  "www",
]);

function thaiLabel(raw) {
  const s = String(raw || "").trim();
  if (!s || WEAK_LABELS.has(s.toLowerCase())) return "";
  if (THAI_REL[s]) return THAI_REL[s];
  if (/[ก-๙]/.test(s)) return s;
  return "";
}

function isSpecificNetwork(name) {
  const s = String(name || "").trim();
  if (!s || s === "-" || s.length < 12) return false;
  if (GENERIC_NETWORK.some((x) => s === x || s.startsWith(x))) return false;
  if (
    !(
      s.includes("แก๊ง") ||
      s.includes("เครือข่าย") ||
      s.includes("เว็บ") ||
      s.includes("ปฏิบัติการ") ||
      s.includes("ยุทธการ")
    )
  ) {
    return false;
  }
  if (s.startsWith("เว็บพนัน") && s.length < 18) return false;
  if (s === "เว็บพนันออนไลน์" || s === "เว็บพนันต่างประเทศ") return false;
  return true;
}

function looksLikeUnit(title) {
  const t = String(title || "").trim();
  if (!t) return false;
  if (BARE.has(t)) return true;
  if (
    /บก\.|บช\.|กก\.|สภ\.|สน\.|ภ\.จว|ภ\.\d|ตชด|สตม|สตช|ปปส|ปปง|ตำรวจ|กรม|กระทรวง|กองบัญชา|กองบังคับ|ศูนย์|สำนัก|สถานี/.test(
      t,
    )
  ) {
    return true;
  }
  if (/^(ผบ|รองผบ|ผู้บัญชา|จเร)/.test(t)) return true;
  if (/^[A-Z][A-Z0-9.&/\- ]{1,18}$/.test(t)) return true;
  if (/^(Meta|ThaiCERT|ETDA|DSI|AFNC|TICAC|DOPA)$/i.test(t)) return true;
  return false;
}

function entityGroupForFolder(folder, title) {
  const f = String(folder || "");
  const name = String(title || "").trim();
  if (!name || BARE.has(name)) return null;
  if (looksLikeUnit(name) || f.includes("Units")) return "หน่วย";
  if (f.includes("Projects")) return isSpecificNetwork(name) ? "ข่ายเครือข่าย" : null;
  if (f.includes("People")) return looksLikeUnit(name) ? "หน่วย" : "บุคคล";
  if (f.includes("Places") || f.includes("สถานที่")) return "สถานที่";
  return null;
}

function windowAt(text, index, len) {
  return text.slice(Math.max(0, index - 80), Math.min(text.length, index + len + 80));
}

function royalNearby(win) {
  return /สมเด็จ|พระราช|ราชินี|พระมหากรุณา|ในหลวง|พระบรม/.test(win);
}

function pairName(given, sur) {
  const g = String(given || "").trim();
  const s = String(sur || "").trim();
  if (g.length < 2 || s.length < 2) return "";
  if (STOP_GIVEN.has(g) || STOP_SUR.has(s)) return "";
  if (/ผู้บัญชา|จังหวัด|ตำรวจ|อำเภอ|กระทรวง|กรม|สำนัก/.test(g + s)) return "";
  if (BARE.has(g) || BARE.has(s) || BARE.has(`${g} ${s}`)) return "";
  return `${g} ${s}`;
}

function pushUnique(out, item) {
  if (!item?.name || BARE.has(item.name)) return;
  if (out.some((x) => x.name === item.name)) return;
  out.push(item);
}

function extractRanked(text, out) {
  const re =
    /(?:พล\.ต\.[ตทอ]|พ\.ต\.[ตทอ]|ร\.ต\.[ตทอ]|ส\.ต\.[ตทอ]|จ\.ส\.ต|ด\.ต)\.?\s*([ก-๙]{2,14})\s+([ก-๙]{2,20})/g;
  let m;
  while ((m = re.exec(text))) {
    const name = pairName(m[1], m[2]);
    if (!name) continue;
    const win = windowAt(text, m.index, m[0].length);
    if (royalNearby(win)) continue;
    let rel = "person";
    if (/สั่งการ|กำชับ|มอบนโยบาย|มีหนังสือสั่ง/.test(win)) rel = "ordered_by";
    else if (/แถลง|เปิดเผย|เป็นประธาน|กล่าวถึง|เผยแพร่/.test(win)) rel = "announced_by";
    pushUnique(out, { name, group: "บุคคล", rel });
  }
}

function extractCivilians(text, out) {
  const re = /(?:นางสาว|น\.ส\.|นาย|นาง)\s+([ก-๙]{2,12})\s+([ก-๙]{2,18})/g;
  let m;
  while ((m = re.exec(text))) {
    const name = pairName(m[1], m[2]);
    if (!name) continue;
    const win = windowAt(text, m.index, m[0].length);
    if (royalNearby(win)) continue;
    if (/ผู้ต้องหา|ผู้ถูกกล่าวหา|หมายจับ/.test(win)) {
      pushUnique(out, { name, group: "ผู้ต้องหา", rel: "suspect" });
    } else if (/แถลง|เป็นประธาน|เปิดเผย/.test(win)) {
      pushUnique(out, { name, group: "บุคคล", rel: "announced_by" });
    } else {
      pushUnique(out, { name, group: "บุคคล", rel: "person" });
    }
  }
}

function junkAlias(alias) {
  return /สแกม|แล้ว|เคลียร์|พอต|บ่อน|ไฮโล|ปฏิบัติการ|ยาเสพ|เคตามีน|เอโทมิ|อีโตมิ|ตัดเนื้อ|ตรวจสอบ|เว็บพนัน|คอลเซ็นเตอร์/.test(
    alias,
  );
}

function extractAliases(text, title, out) {
  const re = /(?:รู้จักกันในชื่อ|ชื่อเล่น|ฉายา)\s*[“"']([^”"'\n]{2,28})[”"']/g;
  let m;
  while ((m = re.exec(text))) {
    const alias = m[1].trim();
    if (!isPersonAlias(alias)) continue;
    pushUnique(out, { name: alias, group: "ผู้ต้องหา", rel: "suspect" });
  }
  const q = /[“"]([^”"\n]{2,28})[”"]/g;
  while ((m = q.exec(title))) {
    const alias = m[1].trim();
    const classified = classifyTitleQuote(title, alias);
    if (classified) pushUnique(out, classified);
  }
}

function classifyTitleQuote(title, alias) {
  if (!alias || BARE.has(alias) || junkAlias(alias)) return null;
  if (/เพจ/.test(title) && alias.length >= 4) {
    return { name: alias, group: "บัญชี", rel: "account" };
  }
  if (/แก๊ง|เครือข่าย/.test(title) && /[ก-๙]/.test(alias) && alias.length >= 4 && alias.length <= 18 && !/\s/.test(alias)) {
    return { name: alias, group: "ข่ายเครือข่าย", rel: "targets_network" };
  }
  if (/จับ|รวบ|ผู้ต้องหา/.test(title) && isPersonAlias(alias)) {
    return { name: alias, group: "ผู้ต้องหา", rel: "suspect" };
  }
  return null;
}

function isPersonAlias(alias) {
  const s = String(alias || "").trim();
  if (s.length < 2 || s.length > 28) return false;
  if (BARE.has(s) || junkAlias(s)) return false;
  if (/ประเทศ|เกษตร|กระทรวง|กรม|ตำรวจ/.test(s)) return false;
  if (!/[ก-๙]/.test(s)) return false;
  return true;
}

function isOfficialHost(token) {
  return /\.(?:go|or|ac|mi)\.th$/i.test(token) || /immigration|royalthaipolice|police\.go/i.test(token);
}

function accountContext(text, index) {
  const win = windowAt(text, index, 24);
  return /พนัน|คาสิโน|หลอก|สแกม|บัญชี|คริปโต|เว็บพนัน|แพลตฟอร์ม/.test(win);
}

function stripTrailingPunct(token) {
  let end = token.length;
  while (end > 0 && ".”\"'".includes(token[end - 1])) end -= 1;
  return token.slice(0, end);
}

function extractBrandAccounts(text, out) {
  // Each optional word keeps its own space so stacked \s* cannot re-split one gap.
  const brand =
    /(?:เว็บไซต์พนัน|เว็บพนัน|แพลตฟอร์ม)\s*(?:ออนไลน์\s*)?(?:ชื่อ\s*)?[“"']?([A-Za-z][A-Za-z0-9._-]{3,28})/g;
  let m;
  while ((m = brand.exec(text))) {
    const token = stripTrailingPunct(m[1]);
    if (STOP_BRAND.has(token.toLowerCase()) || isStopAccount(token) || isOfficialHost(token)) continue;
    if (!/\d/.test(token) && !token.includes(".")) continue;
    pushUnique(out, { name: token, group: "บัญชี", rel: "account" });
  }
}

function nextBookHit(text, from) {
  const prefixes = ["เลขที่บัญชี", "บัญชีธนาคารเลขที่", "บัญชีเลขที่"];
  let at = -1;
  let len = 0;
  for (const p of prefixes) {
    const idx = text.indexOf(p, from);
    if (idx !== -1 && (at === -1 || idx < at)) {
      at = idx;
      len = p.length;
    }
  }
  return { at, len };
}

function skipBookSep(text, i) {
  while (i < text.length && /\s/.test(text[i])) i += 1;
  if (i < text.length && (text[i] === ":" || text[i] === "：")) {
    i += 1;
    while (i < text.length && /\s/.test(text[i])) i += 1;
  }
  return i;
}

function readBookNumber(text, i) {
  if (i >= text.length || !/\d/.test(text[i])) return "";
  const start = i;
  let last = i;
  const limit = Math.min(text.length, start + 24);
  i += 1;
  while (i < limit) {
    const ch = text[i];
    if (ch !== "-" && ch !== " " && !/\d/.test(ch)) break;
    if (/\d/.test(ch)) last = i;
    i += 1;
  }
  if (last - start < 8) return "";
  return text.slice(start, last + 1);
}

function extractBookAccounts(text, out) {
  // Direct scan: the old \s* \s* and overlapping digit class backtracked super-linearly.
  let from = 0;
  while (from < text.length) {
    const hit = nextBookHit(text, from);
    if (hit.at === -1) return;
    const sep = skipBookSep(text, hit.at + hit.len);
    const raw = readBookNumber(text, sep);
    if (!raw) {
      from = hit.at + 1;
      continue;
    }
    pushUnique(out, { name: `บัญชี ${raw.replace(/\s+/g, "")}`, group: "บัญชี", rel: "account" });
    from = sep + raw.length;
  }
}

function extractAccounts(text, out) {
  const hosts = /\b([a-z0-9][a-z0-9-]{1,24}\.(?:com|net|io|gg))\b/gi;
  let m;
  while ((m = hosts.exec(text))) {
    const host = m[1].toLowerCase();
    if (isStopAccount(host) || isOfficialHost(host) || host.length < 6) continue;
    if (!accountContext(text, m.index)) continue;
    pushUnique(out, { name: host, group: "บัญชี", rel: "account" });
  }
  extractBrandAccounts(text, out);
  extractBookAccounts(text, out);
}

function extractNetworks(post, out) {
  const name = String(post.gang_or_group || "").trim();
  if (!isSpecificNetwork(name)) return;
  pushUnique(out, { name, group: "ข่ายเครือข่าย", rel: "targets_network" });
}

function extractPlace(post) {
  const title = String(post.title || "");
  const provinces = new Set((post.province || []).map(String));
  for (const nick of PLACE_NICKS) {
    if (provinces.has(nick)) continue;
    if (title.includes(nick)) return nick;
  }
  const m = /(?:อำเภอ|เขต)\s+([ก-๙]{3,12})/.exec(title);
  if (!m) return "";
  const name = m[1];
  if (name === "เมือง" || provinces.has(name) || name.length < 4) return "";
  if (/แจ้ง|ดำเนิน|ไม่ได้|การ|ความ|และ|ของ|ให้/.test(name)) return "";
  return name;
}

function postText(post) {
  const tags = Array.isArray(post.tags) ? post.tags.join(" ") : "";
  return [
    post.title || "",
    post.gang_or_group || "",
    tags,
    String(post.content || "").slice(0, 4000),
    String(post.analysis_notes || "").slice(0, 1500),
  ].join("\n");
}

function extractPostEntities(post) {
  const text = postText(post);
  const title = String(post.title || "");
  const out = [];
  extractRanked(text, out);
  extractCivilians(text, out);
  extractAliases(text, title, out);
  extractAccounts(text, out);
  extractNetworks(post, out);
  const place = extractPlace(post);
  if (place) pushUnique(out, { name: place, group: "สถานที่", rel: "located_in" });
  return out.slice(0, 8);
}

module.exports = {
  THAI_REL,
  thaiLabel,
  isSpecificNetwork,
  looksLikeUnit,
  entityGroupForFolder,
  extractPostEntities,
};
