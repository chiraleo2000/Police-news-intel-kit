#!/usr/bin/env node
/**
 * Build github-pages/data/graph.json from the local Obsidian vault (wikilinks).
 * Vault stays private (gitignored); only the derived graph is published to Pages.
 *
 * Usage: node ops/build-obsidian-graph.js
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const VAULT = path.join(ROOT, "vault");
const OUT = path.join(ROOT, "github-pages", "data", "graph.json");

const FM_LINE_RE = /^(\w+):(.*)$/;
const LABELED_REL_KEYS = ["rel_units", "rel_people", "rel_projects", "rel_cases"];

function walkMd(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    if (name === ".obsidian" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkMd(full, acc);
    else if (name.toLowerCase().endsWith(".md")) acc.push(full);
  }
  return acc;
}

function isQuoted(v, quote) {
  return v.startsWith(quote) && v.endsWith(quote);
}

function unquote(v) {
  if (isQuoted(v, '"') || isQuoted(v, "'")) return v.slice(1, -1);
  return v;
}

function parseFmValue(rawValue) {
  const v = unquote(rawValue.trim());
  if (v.startsWith("[") && v.endsWith("]")) {
    try {
      return JSON.parse(v.replaceAll("'", '"'));
    } catch {
      return v;
    }
  }
  if (v === "true" || v === "false") return v === "true";
  return v;
}

function splitFrontmatter(raw) {
  if (!raw.startsWith("---")) return { fm: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { fm: {}, body: raw };
  const block = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const fm = {};
  for (const line of block.split(/\r?\n/)) {
    const m = FM_LINE_RE.exec(line);
    if (m) fm[m[1]] = parseFmValue(m[2]);
  }
  return { fm, body };
}

function kindFromRel(rel) {
  const top = rel.split("/")[0] || "";
  if (top === "20_Cases") return "case";
  if (top === "30_Entities") return "entity";
  if (top === "40_CrimeTypes") return "crime_type";
  if (top === "10_Daily") return "daily";
  return "other";
}

function entitySubtype(rel) {
  if (!rel.startsWith("30_Entities/")) return null;
  const parts = rel.split("/");
  return parts[1] || null;
}

function firstHeading(body) {
  const m = /^#[ \t]+([^\r\n]+)/m.exec(body);
  return m ? m[1].trim() : null;
}

function wikilinkLabel(inner) {
  const pipe = inner.indexOf("|");
  if (pipe >= 0) return inner.slice(pipe + 1);
  const hash = inner.indexOf("#");
  if (hash >= 0) return inner.slice(0, hash);
  return inner;
}

function consumeWikilink(body, i) {
  const end = body.indexOf("]]", i + 2);
  if (end < 0) return null;
  return { text: wikilinkLabel(body.slice(i + 2, end)), next: end + 2 };
}

function consumeMarkdownLink(body, i) {
  if (body[i] !== "[") return null;
  const close = body.indexOf("]", i + 1);
  if (close <= i || body[close + 1] !== "(") return null;
  const urlEnd = body.indexOf(")", close + 2);
  if (urlEnd <= close) return null;
  return { text: body.slice(i + 1, close), next: urlEnd + 1 };
}

/** Linear scan — avoids nested-quantifier backtracking in wikilink/markdown regexes. */
function replaceInlineLinks(body) {
  let out = "";
  let i = 0;
  while (i < body.length) {
    const wiki = body.startsWith("[[", i) ? consumeWikilink(body, i) : null;
    const link = wiki || consumeMarkdownLink(body, i);
    if (link) {
      out += link.text;
      i = link.next;
    } else {
      out += body[i];
      i += 1;
    }
  }
  return out;
}

function excerpt(body, max = 360) {
  const text = replaceInlineLinks(body.replaceAll(/^#+[ \t]+[^\r\n]+/gm, ""))
    .replaceAll(/[*_`>#-]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

function labeledRels(fm) {
  const out = [];
  for (const key of LABELED_REL_KEYS) {
    const arr = fm[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const target = String(item.target || "").trim();
      const label = String(item.rel || "mentions").trim();
      if (target) out.push({ target, label });
    }
  }
  return out;
}

function wikilinkCut(inner) {
  const pipe = inner.indexOf("|");
  const hash = inner.indexOf("#");
  const cuts = [pipe, hash].filter((n) => n >= 0);
  return cuts.length ? Math.min(...cuts) : inner.length;
}

function wikilinkRelLabel(inner, pipe) {
  if (pipe < 0) return "mentions";
  const rel = /rel:(\w+)/.exec(inner.slice(pipe + 1));
  return rel ? rel[1] : "mentions";
}

function extractLinks(body) {
  const out = [];
  const seen = new Set();
  let i = 0;
  while (i < body.length) {
    if (!body.startsWith("[[", i)) {
      i += 1;
      continue;
    }
    const end = body.indexOf("]]", i + 2);
    if (end < 0) break;
    const inner = body.slice(i + 2, end);
    const pipe = inner.indexOf("|");
    const target = inner.slice(0, wikilinkCut(inner)).trim().replaceAll("\\", "/");
    const label = wikilinkRelLabel(inner, pipe);
    if (target) {
      const key = `${target}\0${label}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ target, label });
      }
    }
    i = end + 2;
  }
  return out;
}

function normalizeKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replaceAll("\\", "/")
    .replace(/\.md$/i, "");
}

function parseTags(tags) {
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === "string") return tags.split(/[, ]+/).filter(Boolean);
  return [];
}

function writeGraph(graph) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(graph, null, 1) + "\n");
}

function writeEmptyGraph() {
  console.warn("WARN: vault/ missing — writing empty graph.json");
  const empty = {
    generated_at: new Date().toISOString(),
    schema_version: 1,
    source: "vault/",
    stats: { nodes: 0, edges: 0, unresolved: 0 },
    nodes: [],
    edges: [],
  };
  writeGraph(empty);
  return empty;
}

function createState() {
  return {
    nodes: [],
    byId: new Map(),
    aliasIndex: new Map(), // normalized alias → id
    edges: [],
    edgeKeys: new Set(),
    unresolved: 0,
    unresolvedSamples: [],
  };
}

function addAlias(state, alias, id) {
  const k = normalizeKey(alias);
  if (!k) return;
  if (!state.aliasIndex.has(k)) state.aliasIndex.set(k, id);
}

function processFile(full, state) {
  const rel = path.relative(VAULT, full).split(path.sep).join("/");
  const id = rel.replace(/\.md$/i, "");
  const raw = fs.readFileSync(full, "utf8");
  const { fm, body } = splitFrontmatter(raw);
  const title = firstHeading(body) || path.basename(id);
  const kind = kindFromRel(rel);
  const tags = parseTags(fm.tags);

  const node = {
    id,
    title,
    kind,
    folder: rel.split("/").slice(0, -1).join("/") || "",
    entity_group: entitySubtype(rel),
    date: fm.date || null,
    case_id: fm.case_id || (kind === "case" ? path.basename(id) : null),
    crime_type: fm.crime_type || null,
    bureau: fm.bureau || null,
    area: fm.area || null,
    tags,
    links: extractLinks(body),
    rels: labeledRels(fm),
    excerpt: excerpt(body),
    path: rel,
  };
  state.nodes.push(node);
  state.byId.set(id, node);

  addAlias(state, id, id);
  addAlias(state, path.basename(id), id);
  addAlias(state, title, id);
  if (fm.case_id) addAlias(state, String(fm.case_id), id);
}

function createUnresolvedNode(rawTarget, id) {
  return {
    id,
    title: rawTarget,
    kind: "unresolved",
    folder: "",
    entity_group: null,
    date: null,
    case_id: null,
    crime_type: null,
    bureau: null,
    area: null,
    tags: [],
    links: [],
    rels: [],
    excerpt: "",
    path: null,
  };
}

function pushEdge(state, source, targetId, label) {
  if (!targetId || targetId === source) return;
  const ek = `${source}→${targetId}→${label}`;
  if (state.edgeKeys.has(ek)) return;
  state.edgeKeys.add(ek);
  state.edges.push({ source, target: targetId, label: label || "mentions" });
}

function resolveTarget(state, rawTarget) {
  let targetId = state.aliasIndex.get(normalizeKey(rawTarget));
  if (!targetId) {
    const base = normalizeKey(String(rawTarget).split("/").pop());
    targetId = state.aliasIndex.get(base);
  }
  if (targetId) return targetId;

  state.unresolved++;
  if (state.unresolvedSamples.length < 12) {
    state.unresolvedSamples.push({ from: "?", to: rawTarget });
  }
  const danglingId = `unresolved:${rawTarget}`;
  if (!state.byId.has(danglingId)) {
    const dang = createUnresolvedNode(rawTarget, danglingId);
    state.nodes.push(dang);
    state.byId.set(danglingId, dang);
    addAlias(state, rawTarget, danglingId);
  }
  return danglingId;
}

function stripRelSuffix(rawTarget) {
  const s = String(rawTarget);
  const idx = s.indexOf("|rel:");
  return idx < 0 ? s : s.slice(0, idx);
}

function resolveAndPushEdges(node, state) {
  for (const rel of node.rels || []) {
    pushEdge(state, node.id, resolveTarget(state, rel.target), rel.label);
  }
  for (const rawTarget of node.links) {
    const link = typeof rawTarget === "string" ? { target: rawTarget, label: "mentions" } : rawTarget;
    const clean = stripRelSuffix(link.target);
    pushEdge(state, node.id, resolveTarget(state, clean), link.label || "mentions");
  }
}

function computeDegrees(edges) {
  const degrees = new Map();
  for (const e of edges) {
    degrees.set(e.source, (degrees.get(e.source) || 0) + 1);
    degrees.set(e.target, (degrees.get(e.target) || 0) + 1);
  }
  return degrees;
}

function build() {
  if (!fs.existsSync(VAULT)) return writeEmptyGraph();

  const state = createState();
  for (const full of walkMd(VAULT)) processFile(full, state);

  // Only nodes that existed before resolution; new unresolved nodes are appended after this count.
  const nodeCount = state.nodes.length;
  for (let i = 0; i < nodeCount; i++) {
    const node = state.nodes[i];
    if (node.kind === "crime_type" || node.kind === "daily") continue;
    resolveAndPushEdges(node, state);
  }

  // Strip heavy fields from published nodes (keep links count via edges)
  const degrees = computeDegrees(state.edges);
  const publishedNodes = state.nodes.map(({ links, rels, ...rest }) => ({
    ...rest,
    degree: degrees.get(rest.id) || 0,
  }));

  const stats = {
    nodes: publishedNodes.length,
    edges: state.edges.length,
    unresolved: state.unresolved,
    by_kind: {},
  };
  for (const n of publishedNodes) {
    stats.by_kind[n.kind] = (stats.by_kind[n.kind] || 0) + 1;
  }

  const graph = {
    generated_at: new Date().toISOString(),
    schema_version: 2,
    source: "vault/",
    note: "Derived from Obsidian wikilinks. Local vault/ is the second brain; this file is the Pages view.",
    stats,
    unresolved_samples: state.unresolvedSamples,
    nodes: publishedNodes,
    edges: state.edges,
  };

  writeGraph(graph);
  console.log(
    `graph.json: ${stats.nodes} nodes / ${stats.edges} edges · unresolved=${state.unresolved} · ${OUT}`
  );
  return graph;
}

build();
