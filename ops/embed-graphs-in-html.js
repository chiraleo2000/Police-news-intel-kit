/**
 * Inline each story's ego SVG and Thai relation list into the daily HTML
 * report, so HTML→PDF keeps both the article and the graph.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const graphsDir = path.join(root, "github-pages", "data", "graphs");
const documentDir = path.join(root, "Document");

const GRAPH_CSS =
  ".story-graph{margin:8px 0 18px;padding:8px 0 4px;border-top:1px solid #ccc;page-break-inside:avoid}" +
  ".story-graph svg{display:block;width:100%;height:auto;max-height:440px}" +
  ".story-graph h4{margin:8px 0 4px;font-size:16pt}" +
  ".story-graph ul{margin:4px 0 8px;padding-left:1.2em}";

function norm(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replaceAll(/\s+/g, " ")
    .replaceAll(/[“”„«»"']/g, "")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function loadPosts(htmlPath) {
  const base = path.basename(htmlPath, ".html") + ".json";
  const candidates = [
    path.join(path.dirname(htmlPath), base),
    path.join(root, "github-pages", "data", base),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) return [];
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(doc.posts) ? doc.posts : [];
}

function readGraph(caseId) {
  const svgPath = path.join(graphsDir, `${caseId}.svg`);
  const jsonPath = path.join(graphsDir, `${caseId}.json`);
  if (!fs.existsSync(svgPath)) return null;
  let svg = fs.readFileSync(svgPath, "utf8").replace(/<\?xml[^?]*\?>/, "").trim();
  svg = svg.replace(/<svg\b([^>]*)>/, (_match, attrs) => {
    const cleaned = attrs.replaceAll(/\swidth="[^"]*"/g, "").replaceAll(/\sheight="[^"]*"/g, "");
    return `<svg width="100%" height="auto"${cleaned}>`;
  });
  svg = svg.replaceAll('font-family="Sarabun, Anuphan, sans-serif"', 'font-family="THSarabun, sans-serif"');
  const meta = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, "utf8")) : { relations: [] };
  return { svg, relations: meta.relations || [] };
}

function relationItems(relations) {
  if (!relations.length) return "<li>—</li>";
  return relations
    .map((rel) => `<li>${escapeHtml(rel.label)} — ${escapeHtml(rel.target_title)}</li>`)
    .join("");
}

function crossStoryLine(relations) {
  const links = relations.filter(
    (rel) => rel.label === "เกี่ยวข้องกับ" || rel.label === "ติดตามจาก" || String(rel.target_id || "").includes("20_Cases")
  );
  if (!links.length) return "ไม่มีเส้นไปข่าวอื่น — ไม่ใช่เหตุการณ์เดียวกันหรือการติดตามผลที่ชี้ได้";
  return links.map((rel) => `${rel.label}: ${rel.target_title}`).map(escapeHtml).join("; ");
}

function graphSection(post) {
  const graph = readGraph(post.id);
  if (!graph) {
    return `<section class="story-graph"><h4>ข้อมูลกราฟของข่าวนี้</h4><p>ยังไม่มีภาพกราฟของหัวข่าวนี้</p></section>\n`;
  }
  return (
    `<section class="story-graph">` +
    `<h4>ข้อมูลกราฟของข่าวนี้</h4>` +
    graph.svg +
    `<p><b>เส้นความสัมพันธ์:</b></p><ul>${relationItems(graph.relations)}</ul>` +
    `<p><b>เชื่อมข่าวอื่น:</b> ${crossStoryLine(graph.relations)}</p>` +
    `</section>\n`
  );
}

function ensureCss(html) {
  if (html.includes(".story-graph{")) return html;
  return html.replace("</style>", `${GRAPH_CSS}</style>`);
}

function embedFile(htmlPath) {
  const posts = loadPosts(htmlPath);
  const byTitle = new Map(posts.map((post) => [norm(post.title), post]));
  let html = ensureCss(fs.readFileSync(htmlPath, "utf8"));
  const parts = html.split(/(?=<h3>)/);
  let matched = 0;
  let missed = 0;
  const out = [parts[0]];
  for (const part of parts.slice(1)) {
    const titleMatch = part.match(/^<h3>([\s\S]*?)<\/h3>/);
    const title = titleMatch ? norm(titleMatch[1]) : "";
    const cleaned = part.replaceAll(/<section class="story-graph">[\s\S]*?<\/section>\s*/g, "");
    const post = byTitle.get(title);
    if (!post) {
      missed += 1;
      out.push(cleaned);
      continue;
    }
    matched += 1;
    const section = graphSection(post);
    const headingAt = cleaned.search(/<h2[\s>]/);
    if (headingAt >= 0) out.push(cleaned.slice(0, headingAt) + section + cleaned.slice(headingAt));
    else out.push(cleaned.trimEnd() + "\n" + section);
  }
  fs.writeFileSync(htmlPath, out.join(""), "utf8");
  return { file: path.relative(root, htmlPath), stories: parts.length - 1, matched, missed };
}

const htmlFiles = [];
for (const folder of fs.readdirSync(documentDir)) {
  const dir = path.join(documentDir, folder);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const name of fs.readdirSync(dir)) {
    if (!/_crime.*\.html$/i.test(name) || name.includes("infographic")) continue;
    htmlFiles.push(path.join(dir, name));
  }
}

let embedded = 0;
for (const file of htmlFiles.sort()) {
  const result = embedFile(file);
  embedded += result.matched;
  console.log(`${result.file} stories=${result.stories} matched=${result.matched} missed=${result.missed}`);
}
console.log(`embedded ${embedded} graphs`);
