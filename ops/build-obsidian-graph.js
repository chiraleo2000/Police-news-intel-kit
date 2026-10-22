#!/usr/bin/env node
/**
 * Build github-pages/data/graph.json from the local Obsidian vault (wikilinks).
 * Vault stays private (gitignored); only the derived graph is published to Pages.
 *
 * Usage: node ops/build-obsidian-graph.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VAULT = path.join(ROOT, "vault");
const OUT = path.join(ROOT, "github-pages", "data", "graph.json");

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

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

function splitFrontmatter(raw) {
  if (!raw.startsWith("---")) return { fm: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { fm: {}, body: raw };
  const block = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const fm = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (v.startsWith("[") && v.endsWith("]")) {
      try {
        fm[m[1]] = JSON.parse(v.replace(/'/g, '"'));
      } catch {
        fm[m[1]] = v;
      }
    } else if (v === "true" || v === "false") {
      fm[m[1]] = v === "true";
    } else {
      fm[m[1]] = v;
    }
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
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function excerpt(body, max = 360) {
  const text = body
    .replace(/^#+\s+.+$/gm, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

function extractLinks(body) {
  const out = [];
  WIKILINK_RE.lastIndex = 0;
  let m;
  while ((m = WIKILINK_RE.exec(body)) !== null) {
    const target = m[1].trim().replace(/\\/g, "/");
    if (target) out.push(target);
  }
  return [...new Set(out)];
}

function normalizeKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "");
}

function build() {
  if (!fs.existsSync(VAULT)) {
    console.warn("WARN: vault/ missing — writing empty graph.json");
    const empty = {
      generated_at: new Date().toISOString(),
      schema_version: 1,
      source: "vault/",
      stats: { nodes: 0, edges: 0, unresolved: 0 },
      nodes: [],
      edges: [],
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(empty, null, 1) + "\n");
    return empty;
  }

  const files = walkMd(VAULT);
  const nodes = [];
  const byId = new Map();
  const aliasIndex = new Map(); // normalized alias → id

  function addAlias(alias, id) {
    const k = normalizeKey(alias);
    if (!k) return;
    if (!aliasIndex.has(k)) aliasIndex.set(k, id);
  }

  for (const full of files) {
    const rel = path.relative(VAULT, full).split(path.sep).join("/");
    const id = rel.replace(/\.md$/i, "");
    const raw = fs.readFileSync(full, "utf8");
    const { fm, body } = splitFrontmatter(raw);
    const title = firstHeading(body) || path.basename(id);
    const kind = kindFromRel(rel);
    const tags = Array.isArray(fm.tags)
      ? fm.tags.map(String)
      : typeof fm.tags === "string"
        ? fm.tags.split(/[, ]+/).filter(Boolean)
        : [];

    const node = {
      id,
      title,
      kind,
      folder: rel.split("/").slice(0, -1).join("/") || "",
      entity_group: entitySubtype(rel),
      date: fm.date || null,
      case_id: fm.case_id || (kind === "case" ? path.basename(id) : null),
      crime_type: fm.crime_type || null,
      tags,
      links: extractLinks(body),
      excerpt: excerpt(body),
      path: rel,
    };
    nodes.push(node);
    byId.set(id, node);

    addAlias(id, id);
    addAlias(path.basename(id), id);
    addAlias(title, id);
    if (fm.case_id) addAlias(String(fm.case_id), id);
  }

  const edges = [];
  const edgeKeys = new Set();
  let unresolved = 0;
  const unresolvedSamples = [];

  for (const node of nodes) {
    for (const rawTarget of node.links) {
      const key = normalizeKey(rawTarget);
      let targetId = aliasIndex.get(key);
      if (!targetId) {
        // try basename of path-like link
        const base = normalizeKey(rawTarget.split("/").pop());
        targetId = aliasIndex.get(base);
      }
      if (!targetId) {
        unresolved++;
        if (unresolvedSamples.length < 12) {
          unresolvedSamples.push({ from: node.id, to: rawTarget });
        }
        // Keep dangling node so the brain shows missing links (Obsidian-like)
        const danglingId = `unresolved:${rawTarget}`;
        if (!byId.has(danglingId)) {
          const dang = {
            id: danglingId,
            title: rawTarget,
            kind: "unresolved",
            folder: "",
            entity_group: null,
            date: null,
            case_id: null,
            crime_type: null,
            tags: [],
            links: [],
            excerpt: "",
            path: null,
          };
          nodes.push(dang);
          byId.set(danglingId, dang);
          addAlias(rawTarget, danglingId);
        }
        targetId = danglingId;
      }
      if (targetId === node.id) continue;
      const ek = `${node.id}→${targetId}`;
      if (edgeKeys.has(ek)) continue;
      edgeKeys.add(ek);
      edges.push({ source: node.id, target: targetId });
    }
  }

  // Strip heavy fields from published nodes (keep links count via edges)
  const publishedNodes = nodes.map(({ links, ...rest }) => ({
    ...rest,
    degree: edges.filter((e) => e.source === rest.id || e.target === rest.id).length,
  }));

  const stats = {
    nodes: publishedNodes.length,
    edges: edges.length,
    unresolved,
    by_kind: {},
  };
  for (const n of publishedNodes) {
    stats.by_kind[n.kind] = (stats.by_kind[n.kind] || 0) + 1;
  }

  const graph = {
    generated_at: new Date().toISOString(),
    schema_version: 1,
    source: "vault/",
    note: "Derived from Obsidian wikilinks. Local vault/ is the second brain; this file is the Pages view.",
    stats,
    unresolved_samples: unresolvedSamples,
    nodes: publishedNodes,
    edges,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(graph, null, 1) + "\n");
  console.log(
    `graph.json: ${stats.nodes} nodes / ${stats.edges} edges · unresolved=${unresolved} · ${OUT}`
  );
  return graph;
}

build();
