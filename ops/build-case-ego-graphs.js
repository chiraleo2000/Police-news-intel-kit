#!/usr/bin/env node
/**
 * Build per-case ego subgraph SVGs from github-pages/data/graph.json
 * → github-pages/data/graphs/{case_id}.svg
 *
 * Usage: node ops/build-case-ego-graphs.js
 * Called from rebuild-pages-feed.js after graph.json is built.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const GRAPH = path.join(ROOT, "github-pages", "data", "graph.json");
const OUT_DIR = path.join(ROOT, "github-pages", "data", "graphs");

const KIND_COLOR = {
  case: "#2a7a6a",
  entity: "#3a6ea0",
  crime_type: "#a66b2a",
  daily: "#5a6a7a",
  unresolved: "#a04040",
  other: "#5a6570",
};

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function truncate(s, max) {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function findCaseNodes(graph) {
  return (graph.nodes || []).filter((n) => n.kind === "case");
}

function egoNeighborhood(graph, hub) {
  const edges = (graph.edges || []).filter((e) => e.source === hub.id || e.target === hub.id);
  const ids = new Set([hub.id]);
  for (const e of edges) {
    ids.add(e.source);
    ids.add(e.target);
  }
  const byId = new Map((graph.nodes || []).map((n) => [n.id, n]));
  const nodes = [...ids].map((id) => byId.get(id)).filter(Boolean);
  return { nodes, edges };
}

function layout(hub, neighbors) {
  const W = 760;
  const H = 440;
  const cx = W / 2;
  const cy = H / 2 + 8;
  const positions = new Map();
  positions.set(hub.id, { x: cx, y: cy, r: 22 });
  const n = neighbors.length;
  const radius = Math.min(175, 70 + n * 12);
  neighbors.forEach((node, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(1, n) - Math.PI / 2;
    const r = node.kind === "crime_type" ? 14 : node.kind === "case" ? 16 : 11;
    positions.set(node.id, {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      r,
    });
  });
  return { W, H, positions };
}

function propLines(node) {
  if (node.kind === "case") {
    return [node.bureau, node.area, node.crime_type, node.status]
      .filter((x) => x && x !== "-")
      .map((x) => truncate(x, 28))
      .slice(0, 3);
  }
  if (node.kind === "entity" && node.entity_group) {
    return [truncate(node.entity_group, 22)];
  }
  if (node.kind === "crime_type") return ["ประเภทคดี"];
  return [];
}

function renderSvg(hub, neighbors, edges) {
  const { W, H, positions } = layout(hub, neighbors);
  const lines = [];
  for (const e of edges) {
    const a = positions.get(e.source);
    const b = positions.get(e.target);
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    lines.push(
      `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#7a8a9a" stroke-width="1.4" opacity="0.75"/>`
    );
    if (e.label && e.label !== "mentions") {
      const shown = truncate(e.label, 18);
      const width = Math.min(168, Math.max(64, [...shown].length * 9 + 14));
      lines.push(
        `<rect x="${(mx - width / 2).toFixed(1)}" y="${(my - 9).toFixed(1)}" width="${width.toFixed(1)}" height="16" rx="8" fill="#fff" stroke="#c5d0da" stroke-width="0.8"/>` +
          `<text x="${mx.toFixed(1)}" y="${(my + 3).toFixed(1)}" text-anchor="middle" font-size="10" fill="#2a3540" font-family="Sarabun, Anuphan, sans-serif">${esc(shown)}</text>`
      );
    }
  }

  const nodeEls = [hub, ...neighbors].map((node) => {
    const p = positions.get(node.id);
    if (!p) return "";
    const color = KIND_COLOR[node.kind] || KIND_COLOR.other;
    const title = truncate(node.title, node.kind === "case" ? 36 : 26);
    const props = propLines(node);
    const labelY = p.y + p.r + 14;
    const pillW = Math.min(220, 12 + title.length * 7.2);
    let html = `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r}" fill="${color}" stroke="#fff" stroke-width="2"/>`;
    html += `<rect x="${(p.x - pillW / 2).toFixed(1)}" y="${(labelY - 11).toFixed(1)}" width="${pillW.toFixed(1)}" height="18" rx="9" fill="rgba(255,255,255,0.94)" stroke="#c5d0da"/>`;
    html += `<text x="${p.x.toFixed(1)}" y="${(labelY + 2).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="#1a222c" font-family="Sarabun, Anuphan, sans-serif">${esc(title)}</text>`;
    props.forEach((line, i) => {
      html += `<text x="${p.x.toFixed(1)}" y="${(labelY + 16 + i * 12).toFixed(1)}" text-anchor="middle" font-size="10" fill="#4a5a68" font-family="Sarabun, Anuphan, sans-serif">${esc(line)}</text>`;
    });
    return html;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="ego graph ${esc(hub.case_id || hub.id)}">
  <rect width="100%" height="100%" fill="#f4f7fa"/>
  <text x="16" y="22" font-size="13" font-weight="700" fill="#1a222c" font-family="Sarabun, Anuphan, sans-serif">ข้อมูลกราฟ · ${esc(truncate(hub.title, 48))}</text>
  ${lines.join("\n  ")}
  ${nodeEls.join("\n  ")}
</svg>
`;
}

function relationSummary(hub, edges, byId) {
  return edges.map((e) => {
    const otherId = e.source === hub.id ? e.target : e.source;
    const other = byId.get(otherId);
    return {
      label: e.label || "",
      target_id: otherId,
      target_title: other?.title || otherId,
      direction: e.source === hub.id ? "out" : "in",
    };
  });
}

function build() {
  if (!fs.existsSync(GRAPH)) {
    console.warn("WARN: graph.json missing — skip ego SVGs");
    return;
  }
  const graph = JSON.parse(fs.readFileSync(GRAPH, "utf8"));
  const byId = new Map((graph.nodes || []).map((n) => [n.id, n]));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // clear old svgs that we own (keep folder)
  for (const name of fs.readdirSync(OUT_DIR)) {
    if (name.endsWith(".svg") || name.endsWith(".json")) {
      fs.unlinkSync(path.join(OUT_DIR, name));
    }
  }

  const cases = findCaseNodes(graph);
  let written = 0;
  const index = [];
  for (const hub of cases) {
    const { nodes, edges } = egoNeighborhood(graph, hub);
    const neighbors = nodes.filter((n) => n.id !== hub.id);
    const caseKey = hub.case_id || path.basename(hub.id);
    const svg = renderSvg(hub, neighbors, edges);
    const svgPath = path.join(OUT_DIR, `${caseKey}.svg`);
    fs.writeFileSync(svgPath, svg, "utf8");
    const rels = relationSummary(hub, edges, byId);
    const meta = {
      case_id: caseKey,
      title: hub.title,
      generated_at: new Date().toISOString(),
      node_count: nodes.length,
      edge_count: edges.length,
      relations: rels,
      svg: `graphs/${caseKey}.svg`,
    };
    fs.writeFileSync(path.join(OUT_DIR, `${caseKey}.json`), JSON.stringify(meta, null, 1) + "\n");
    index.push({ case_id: caseKey, svg: meta.svg, relations: rels.length });
    written += 1;
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "_index.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        count: written,
        cases: index,
      },
      null,
      1
    ) + "\n"
  );
  console.log(`ego graphs: ${written} case SVG(s) → ${OUT_DIR}`);
}

build();
