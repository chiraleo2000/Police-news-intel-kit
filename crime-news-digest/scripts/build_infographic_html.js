/**
 * build_infographic_html.js
 * แทรกข้อมูลจาก JSON ลงใน infographic_template.html (ฟอร์มย่อ: เรื่อง/ประเด็นสำคัญ/ความเสียหาย/กลุ่มแก๊งค์/Reference)
 * ไฟล์ HTML ที่ได้ใช้ภายในเพื่อแปลงเป็น .jpeg/.pdf เท่านั้น ไม่ส่งมอบให้ผู้ใช้
 *
 * Usage:
 *   node build_infographic_html.js <input.json> <output.html> [statsOverrideJson]
 */
const fs = require("fs");
const path = require("path");

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Usage: node build_infographic_html.js <input.json> <output.html>");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
const templatePath = path.join(__dirname, "infographic_template.html");
let html = fs.readFileSync(templatePath, "utf-8");

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---- stats blocks ----
const totalNews = data.categories.reduce((sum, c) => sum + (c.items ? c.items.length : 0), 0);
const foundCats = data.categories.filter(c => c.items && c.items.length > 0).length;
const emptyCats = data.categories.length - foundCats;

const statsList = data.stats && data.stats.length
  ? data.stats
  : [
      { n: `${totalNews} ข่าว`, l: `พบใน ${foundCats} หมวดหมู่` },
      { n: `${emptyCats} หมวด`, l: `ไม่พบข่าววันนี้` },
      { n: data.dateLabel, l: `วันที่สรุป` },
    ];

const statsBlocks = statsList.map(s => `
    <div class="stat">
      <div class="n">${esc(s.n)}</div>
      <div class="l">${esc(s.l)}</div>
    </div>`).join("\n");

// ---- category blocks (slim form: title / points / damage / gang / ref) ----
// หมวดที่ไม่มีข่าว (items ว่าง) จะถูกข้ามไปเลยใน Infographic โดยอัตโนมัติ
// (ไม่ต้อง filter JSON เองก่อนเรียกสคริปต์นี้)
const categoryBlocks = data.categories
  .filter(cat => cat.items && cat.items.length > 0)
  .map(cat => {
  const tagLabel = esc(cat.title).replace(/\s*14\s*รูปแบบ\s*$/, "");
  const cards = cat.items.map((item) => {
    const points = (item.points || []).map(p => `<li>${esc(p)}</li>`).join("\n        ");
    return `
    <div class="card">
      <div class="card-head">
        <h3>${esc(item.title)}</h3>
        <span class="cat-tag">${tagLabel}</span>
      </div>
      <div class="section-label">ประเด็นสำคัญ</div>
      <ul>
        ${points}
      </ul>
      <div class="meta-lines">
        <div class="meta-line"><b>มูลค่าความเสียหาย :</b> ${esc(item.damage || "-")}</div>
        <div class="meta-line"><b>ชื่อกลุ่ม/แก๊ง :</b> ${esc(item.gang || "-")}</div>
      </div>
      <div class="ref"><b>อ้างอิง:</b> ${esc(Array.isArray(item.ref) ? item.ref.join(" , ") : (item.ref || "-"))}</div>
    </div>`;
  }).join("\n");
  return `
  <div class="cat-block">
    ${cards}
  </div>`;
}).join("\n");

// หัวเรื่อง: ถ้า JSON มีฟิลด์ "heading" ใช้ค่านั้น (เช่น โหมดข่าว บช. = "สรุปข่าวจาก บช. วันที่ ...")
// ถ้าไม่มี ใช้หัวเรื่องเดิมของโหมดข่าว 9 แท็ก
const heading = data.heading || `สรุปข่าวอาชญากรรมออนไลน์ประจำวันที่ ${data.dateLabel}`;

html = html
  .replace("{{TITLE}}", esc(heading))
  .replace("{{HEADING}}", esc(heading))
  .replace("{{DATE_LABEL}}", esc(data.dateLabel))
  .replace("{{STATS_BLOCKS}}", "")
  .replace("{{CATEGORY_BLOCKS}}", categoryBlocks);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, "utf-8");
console.log("Wrote:", outputPath);
