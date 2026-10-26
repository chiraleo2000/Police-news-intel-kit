/**
 * ข้อมูลกราฟ — Obsidian-like force layout over data/graph.json
 * Case (news) nodes are hubs; entity / crime_type are smaller satellites.
 * Zoom / pan / fit-to-view scale with graph size.
 * Also builds per-story ego SVG for post detail views.
 */
(() => {
  const ZOOM_MIN = 0.12;
  const ZOOM_MAX = 6;
  const KIND_COLOR = {
    case: "#7dd3c0",
    entity: "#6ea8d8",
    crime_type: "#e0a458",
    daily: "#8b9aab",
    unresolved: "#e07070",
    other: "#9aa5b5",
  };
  const KIND_LABEL = {
    case: "คดี (ข่าว)",
    entity: "เอนทิตี",
    crime_type: "ประเภทอาชญากรรม",
    daily: "รายวัน",
    unresolved: "ลิงก์ค้าง",
    other: "อื่น",
  };
  const KIND_HELP = {
    case: "โหนดหลัก — หัวข่าว/คดีใน vault/20_Cases (ใหญ่กว่าโหนดอื่น)",
    entity: "โหนดย่อย — หน่วย / จังหวัด / คน / กฎหมาย / MO ใน vault/30_Entities",
    crime_type: "โหนดย่อยรวมประเภท ใน vault/40_CrimeTypes",
    daily: "สรุปรายวัน (ไม่ใช่ผลหลัก)",
    unresolved: "[[ลิงก์]] ที่ยังไม่มีโน้ตปลายทาง — ควรแก้ชื่อหรือสร้างโน้ต",
    other: "โน้ตอื่นในคลัง",
  };
  /** English edge labels in graph.json → Thai on screen. Thai labels pass through. */
  const REL_TH = {
    investigated_by: "สืบสวนโดย",
    arrested_by: "จับโดย",
    warrant_from: "หมายจากศาล",
    ordered_by: "สั่งการโดย",
    announced_by: "แจ้งโดย",
    targets_network: "เป้าหมายเครือข่าย",
    mentions: "กล่าวถึง",
    related_to: "เกี่ยวข้องกับ",
    follow_up_of: "ติดตามจาก",
    located_in: "เกิดที่",
    involves_person: "เกี่ยวข้องกับบุคคล",
    suspect: "ผู้ต้องหา",
    account: "บัญชี",
    uses_account: "ใช้บัญชี",
  };

  let graph = null;
  let sim = null;
  let raf = 0;
  let selectedId = null;
  let hoverId = null;
  let drag = null;
  let camera = { x: 0, y: 0, scale: 1 };
  let pendingFit = false;
  let filters = {
    kinds: new Set(["case", "entity", "crime_type", "daily", "unresolved", "other"]),
    q: "",
    minDegree: 0,
    dateFrom: "",
    dateTo: "",
    entityGroup: "",
    bureau: "",
    hideOrphans: false,
    isolate: false,
    showLabels: "auto",
    relation: "",
  };
  let bound = false;

  const els = {};
  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function clampZoom(s) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s));
  }

  function relationLabel(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    if (REL_TH[s]) return REL_TH[s];
    const key = s.toLowerCase().replace(/\s+/g, "_");
    if (REL_TH[key]) return REL_TH[key];
    return s;
  }

  function isGenericMention(label) {
    const s = String(label ?? "").trim().toLowerCase();
    return s === "mentions" || s === "กล่าวถึง";
  }

  function pairKey(a, b) {
    return a < b ? `${a}\0${b}` : `${b}\0${a}`;
  }

  /**
   * Drop blank labels. Drop generic mentions when a more specific edge joins the same pair,
   * unless the caller is filtering to that mention label on purpose.
   */
  function presentEdges(edges, respectRelation) {
    const specific = new Set();
    for (const e of edges) {
      const raw = String(e.label ?? "").trim();
      if (raw && !isGenericMention(raw)) specific.add(pairKey(e.source, e.target));
    }
    const want = respectRelation ? filters.relation : "";
    const seen = new Set();
    const followPairs = new Set();
    for (const e of edges) {
      if (relationLabel(e.label) === "ติดตามจาก") followPairs.add(pairKey(e.source, e.target));
    }
    return edges.filter((e) => {
      const raw = String(e.label ?? "").trim();
      if (!raw) return false;
      const display = relationLabel(raw);
      if (want) return display === want || raw === want;
      const key = pairKey(e.source, e.target);
      if (isGenericMention(raw) && specific.has(key)) return false;
      if (display === "เกี่ยวข้องกับ" && followPairs.has(key)) return false;
      const once = `${key}\0${display}`;
      if (seen.has(once)) return false;
      seen.add(once);
      return true;
    });
  }

  function usableEdges(edges) {
    return presentEdges(edges, true);
  }

  async function loadGraph() {
    const res = await fetch(`data/graph.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("graph.json not found — run node ops/build-obsidian-graph.js");
    return res.json();
  }

  function neighborIds(id) {
    const set = new Set([id]);
    const ids = new Set((graph?.nodes || []).filter(passesBaseFilters).map((n) => n.id));
    ids.add(id);
    for (const e of usableEdges((graph?.edges || []).filter((e) => ids.has(e.source) && ids.has(e.target)))) {
      if (e.source === id) set.add(e.target);
      if (e.target === id) set.add(e.source);
    }
    return set;
  }

  function matchesDegree(n) {
    const degree = n.degree || 0;
    if (degree < filters.minDegree) return false;
    return !(filters.hideOrphans && degree === 0 && n.kind !== "unresolved");
  }

  function matchesGroups(n) {
    if (filters.entityGroup && n.kind === "entity" && n.entity_group !== filters.entityGroup) {
      return false;
    }
    return !(filters.bureau && n.kind === "case" && (n.bureau || "") !== filters.bureau);
  }

  function matchesDates(n) {
    if (filters.dateFrom && n.date && n.date < filters.dateFrom) return false;
    return !(filters.dateTo && n.date && n.date > filters.dateTo);
  }

  function matchesQuery(n) {
    const q = filters.q.trim().toLowerCase();
    if (!q) return true;
    const hay = `${n.title} ${n.id} ${(n.tags || []).join(" ")} ${n.crime_type || ""} ${n.bureau || ""} ${n.area || ""} ${n.entity_group || ""}`.toLowerCase();
    return hay.includes(q);
  }

  function passesBaseFilters(n) {
    return (
      filters.kinds.has(n.kind) &&
      matchesDegree(n) &&
      matchesGroups(n) &&
      matchesDates(n) &&
      matchesQuery(n)
    );
  }

  function visibleNodes() {
    if (!graph) return [];
    let nodes = graph.nodes.filter(passesBaseFilters);
    if (filters.isolate && selectedId) {
      const keep = neighborIds(selectedId);
      nodes = nodes.filter((n) => keep.has(n.id));
    }
    if (filters.hideOrphans || filters.relation) {
      const ids = new Set(nodes.map((n) => n.id));
      const edges = usableEdges((graph.edges || []).filter((e) => ids.has(e.source) && ids.has(e.target)));
      const touched = new Set();
      for (const e of edges) {
        touched.add(e.source);
        touched.add(e.target);
      }
      nodes = nodes.filter((n) => touched.has(n.id) || n.id === selectedId);
    }
    return nodes;
  }

  function visibleEdges(ids) {
    return usableEdges((graph?.edges || []).filter((e) => ids.has(e.source) && ids.has(e.target)));
  }

  function worldFromEvent(ev) {
    const r = els.canvas.getBoundingClientRect();
    const sx = ev.clientX - r.left;
    const sy = ev.clientY - r.top;
    return {
      sx,
      sy,
      x: (sx - camera.x) / camera.scale,
      y: (sy - camera.y) / camera.scale,
    };
  }

  /** Virtual world grows with node count so dense graphs can spread like Obsidian. */
  function worldExtent(nodeCount) {
    const side = Math.max(1100, Math.sqrt(Math.max(1, nodeCount)) * 110);
    return { w: side * 1.2, h: side };
  }

  function nodeRadius(n) {
    const deg = Math.sqrt(n.degree || 0);
    switch (n.kind) {
      case "case":
        return 12 + Math.min(11, deg * 1.55);
      case "crime_type":
        return 7 + Math.min(7, deg * 0.85);
      case "entity":
        return 4.2 + Math.min(4.5, deg * 0.5);
      case "daily":
        return 5.5;
      case "unresolved":
        return 4;
      default:
        return 5;
    }
  }

  function massOf(n) {
    if (n.kind === "case") return 1.8;
    if (n.kind === "crime_type") return 1.25;
    if (n.kind === "entity") return 0.7;
    return 1;
  }

  function idealLinkLength(l) {
    const a = l.source.kind;
    const b = l.target.kind;
    if ((a === "case" && b === "entity") || (a === "entity" && b === "case")) return 52;
    if ((a === "case" && b === "crime_type") || (a === "crime_type" && b === "case")) return 78;
    if (a === "case" && b === "case") return 150;
    return 96;
  }

  function initSim(nodes, edges) {
    const canvas = els.canvas;
    const vw = Math.max(640, canvas.clientWidth || 960);
    const vh = Math.max(480, canvas.clientHeight || 640);
    canvas.width = Math.floor(vw * devicePixelRatio);
    canvas.height = Math.floor(vh * devicePixelRatio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    const { w, h } = worldExtent(nodes.length);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      if (n.x == null) n.x = w / 2 + (Math.random() - 0.5) * w * 0.7;
      if (n.y == null) n.y = h / 2 + (Math.random() - 0.5) * h * 0.7;
      n.vx = n.vx || 0;
      n.vy = n.vy || 0;
    }
    const links = edges
      .map((e) => ({ source: byId.get(e.source), target: byId.get(e.target), label: e.label }))
      .filter((l) => l.source && l.target);

    return { nodes, links, w, h, vw, vh, ctx, alpha: 1 };
  }

  function repulsePair(a, b, repulse, alpha) {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    const dist = Math.hypot(dx, dy) || 0.01;
    const minSep = (nodeRadius(a) + nodeRadius(b)) * 1.15 + 10;
    if (dist >= minSep * 6) return;
    const f = ((repulse * repulse) / (dist * dist)) * 0.38 * alpha;
    const ma = massOf(a);
    const mb = massOf(b);
    dx = (dx / dist) * f;
    dy = (dy / dist) * f;
    a.vx += (dx * mb) / (ma + mb);
    a.vy += (dy * mb) / (ma + mb);
    b.vx -= (dx * ma) / (ma + mb);
    b.vy -= (dy * ma) / (ma + mb);
  }

  function applyRepulsion(nodes, repulse, alpha) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        repulsePair(nodes[i], nodes[j], repulse, alpha);
      }
    }
  }

  function applyLinkPull(links, alpha) {
    for (const l of links) {
      const dx = l.target.x - l.source.x;
      const dy = l.target.y - l.source.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const ideal = idealLinkLength(l);
      const f = ((dist - ideal) / dist) * 0.028 * alpha;
      l.source.vx += dx * f;
      l.source.vy += dy * f;
      l.target.vx -= dx * f;
      l.target.vy -= dy * f;
    }
  }

  function stepNode(n, w, h, alpha) {
    const pad = 40;
    const pull = n.kind === "case" ? 0.00055 : 0.0014;
    n.vx += (w / 2 - n.x) * pull * alpha;
    n.vy += (h / 2 - n.y) * pull * alpha;
    if (drag?.mode === "node" && drag.id === n.id) {
      n.x = drag.x;
      n.y = drag.y;
      n.vx = 0;
      n.vy = 0;
      return;
    }
    n.vx *= 0.84;
    n.vy *= 0.84;
    n.x += n.vx;
    n.y += n.vy;
    n.x = Math.max(pad, Math.min(w - pad, n.x));
    n.y = Math.max(pad, Math.min(h - pad, n.y));
  }

  function tick(state) {
    const { nodes, links, w, h } = state;
    if (state.alpha < 0.012 && drag?.mode !== "node") return false;
    state.alpha *= 0.989;
    const nCount = Math.max(1, nodes.length);
    const repulse = 38 + Math.min(28, Math.sqrt(nCount));
    applyRepulsion(nodes, repulse, state.alpha);
    applyLinkPull(links, state.alpha);
    for (const n of nodes) stepNode(n, w, h, state.alpha);
    return true;
  }

  function strokeColorForLink(hot, dim) {
    if (hot) return "rgba(125, 211, 192, 0.85)";
    if (dim) return "rgba(160, 176, 196, 0.05)";
    return "rgba(160, 176, 196, 0.32)";
  }

  function drawPillLabel(ctx, text, x, y, opts = {}) {
    const fontPx = opts.fontPx || 14;
    const scale = camera.scale || 1;
    const padX = (opts.padX ?? 7) / scale;
    const padY = (opts.padY ?? 5) / scale;
    const align = opts.align || "left";
    ctx.font = `${opts.weight || "700"} ${fontPx / scale}px Sarabun, Anuphan, sans-serif`;
    const w = ctx.measureText(text).width;
    const h = fontPx / scale;
    let left = x;
    if (align === "center") left = x - w / 2;
    else if (align === "right") left = x - w;
    const rx = 7 / scale;
    ctx.fillStyle = opts.bg || "rgba(6, 10, 16, 0.94)";
    ctx.strokeStyle = opts.border || "rgba(232, 240, 248, 0.55)";
    ctx.lineWidth = Math.max(1, 1.25 / scale);
    ctx.beginPath();
    const x0 = left - padX;
    const y0 = y - h - padY * 0.95;
    const bw = w + padX * 2;
    const bh = h + padY * 2.5;
    const r = Math.min(rx, bh / 2, bw / 2);
    ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x0 + bw, y0, x0 + bw, y0 + bh, r);
    ctx.arcTo(x0 + bw, y0 + bh, x0, y0 + bh, r);
    ctx.arcTo(x0, y0 + bh, x0, y0, r);
    ctx.arcTo(x0, y0, x0 + bw, y0, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = opts.fg || "#ffffff";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, left, y);
  }

  function screenOf(x, y) {
    return { x: x * camera.scale + camera.x, y: y * camera.scale + camera.y };
  }

  function segmentHitsView(x1, y1, x2, y2, vw, vh, margin = 32) {
    const a = screenOf(x1, y1);
    const b = screenOf(x2, y2);
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return maxX >= -margin && minX <= vw + margin && maxY >= -margin && minY <= vh + margin;
  }

  function drawLinkLabel(ctx, l, emphasized, text) {
    if (!text) return;
    const mx = (l.source.x + l.target.x) / 2;
    const my = (l.source.y + l.target.y) / 2;
    drawPillLabel(ctx, text, mx, my + 3 / camera.scale, {
      fontPx: emphasized ? 13 : 12,
      align: "center",
      bg: emphasized ? "rgba(8, 36, 32, 0.96)" : "rgba(8, 12, 20, 0.94)",
      border: emphasized ? "rgba(125, 211, 192, 0.85)" : "rgba(220, 232, 244, 0.55)",
      fg: "#ffffff",
      weight: "700",
    });
  }

  function drawLinks(ctx, links, focus, vw, vh) {
    const zoomed = camera.scale >= 0.6;
    const labeled = [];
    for (const l of links) {
      const hot = Boolean(focus) && (l.source.id === focus || l.target.id === focus);
      const dim = Boolean(focus) && !hot;
      const name = relationLabel(l.label);
      const mustName = hot || zoomed;
      if (mustName && !name) continue;
      if (vw && !segmentHitsView(l.source.x, l.source.y, l.target.x, l.target.y, vw, vh)) continue;
      ctx.strokeStyle = strokeColorForLink(hot, dim);
      ctx.lineWidth = (hot ? 2.4 : 1) / camera.scale;
      ctx.beginPath();
      ctx.moveTo(l.source.x, l.source.y);
      ctx.lineTo(l.target.x, l.target.y);
      ctx.stroke();
      if (name && mustName) labeled.push({ l, hot, name });
    }
    labeled.sort((a, b) => Number(a.hot) - Number(b.hot));
    for (const { l, hot, name } of labeled) drawLinkLabel(ctx, l, hot, name);
  }

  function nodeVisual(n, neigh) {
    return {
      r: nodeRadius(n),
      active: n.id === selectedId || n.id === hoverId,
      dim: Boolean(neigh && !neigh.has(n.id)),
      color: KIND_COLOR[n.kind] || KIND_COLOR.other,
    };
  }

  function haloReach(r, active) {
    if (active) return r * 2.6;
    return r * 2.1;
  }

  function drawNodeHalo(ctx, n, r, color, active) {
    const reach = haloReach(r, active);
    const glow = ctx.createRadialGradient(n.x, n.y, r * 0.2, n.x, n.y, reach);
    glow.addColorStop(0, color + "55");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(n.x, n.y, reach, 0, Math.PI * 2);
    ctx.fill();
  }

  function discRadius(r, active) {
    if (active) return r + 1.8;
    return r;
  }

  function drawNodeDisc(ctx, n, r, color, active) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, discRadius(r, active), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (n.kind === "case") {
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1.2 / camera.scale;
      ctx.stroke();
    }
    if (active) {
      ctx.strokeStyle = "#f2f6fb";
      ctx.lineWidth = 2 / camera.scale;
      ctx.stroke();
    }
  }

  function drawNodes(ctx, nodes, neigh) {
    for (const n of nodes) {
      const { r, active, dim, color } = nodeVisual(n, neigh);
      ctx.globalAlpha = dim ? 0.18 : 1;
      // Soft Obsidian-like halo (stronger on case hubs)
      if (!dim && (n.kind === "case" || active)) drawNodeHalo(ctx, n, r, color, active);
      drawNodeDisc(ctx, n, r, color, active);
      ctx.globalAlpha = 1;
    }
  }

  function shouldShowLabel(n, neigh, showAll) {
    if (showAll) return true;
    if (n.id === selectedId || n.id === hoverId) return true;
    if (neigh?.has(n.id)) return true;
    if (n.kind === "case") {
      if (camera.scale < 0.45) return (n.degree || 0) >= 6;
      if (camera.scale < 0.85) return (n.degree || 0) >= 3;
      return true;
    }
    if (n.kind === "crime_type") return camera.scale > 0.75 && (n.degree || 0) >= 3;
    return camera.scale > 1.1 && (n.degree || 0) >= 4;
  }

  function labelKindRank(kind) {
    if (kind === "case") return 0;
    if (kind === "crime_type") return 1;
    return 2;
  }

  function labelDrawCap(showAll, count) {
    if (showAll) return count;
    if (camera.scale >= 0.9) return 280;
    return 80;
  }

  function labelLimit(kind) {
    if (kind === "case") {
      if (camera.scale > 1.2) return 48;
      return 36;
    }
    if (kind === "prop") return 40;
    return 28;
  }

  function truncateLabel(title, kind) {
    const max = labelLimit(kind);
    if (title.length <= max) return title;
    return title.slice(0, max - 1) + "…";
  }

  function nodePropLines(n, active) {
    const zoomed = camera.scale >= 0.85;
    if (!active && !zoomed) return [];
    if (n.kind === "case") {
      return [n.bureau, n.area, n.crime_type]
        .filter((x) => x && String(x) !== "-")
        .map((x) => truncateLabel(String(x), "prop"));
    }
    if (n.kind === "entity" && n.entity_group) {
      return [truncateLabel(String(n.entity_group), "prop")];
    }
    return [];
  }

  function drawLabels(ctx, nodes, neigh, vw, vh) {
    const showAll = filters.showLabels === "all";
    const titlesOff = filters.showLabels === "none";
    const fontPx = Math.max(14, Math.min(18, 16 / Math.sqrt(Math.max(0.45, camera.scale))));
    const labeled = nodes.filter((n) => {
      if (titlesOff && n.id !== selectedId && n.id !== hoverId) return false;
      if (!shouldShowLabel(n, neigh, showAll)) return false;
      if (vw && n.id !== selectedId && n.id !== hoverId) {
        const p = screenOf(n.x, n.y);
        if (p.x < -40 || p.y < -40 || p.x > vw + 40 || p.y > vh + 40) return false;
      }
      return true;
    });
    labeled.sort((a, b) => {
      const ka = labelKindRank(a.kind);
      const kb = labelKindRank(b.kind);
      if (ka !== kb) return ka - kb;
      return (b.degree || 0) - (a.degree || 0);
    });
    const cap = labelDrawCap(showAll, labeled.length);
    const must = labeled.filter((n) => n.id === selectedId || n.id === hoverId);
    const rest = labeled.filter((n) => n.id !== selectedId && n.id !== hoverId);
    const shown = must.concat(rest.slice(0, Math.max(0, cap - must.length)));
    const propPx = Math.max(12, fontPx - 2);
    const step = (propPx + 9) / camera.scale;
    for (const n of shown) {
      const outsideFocus = neigh && !neigh.has(n.id) && n.id !== selectedId && n.id !== hoverId;
      if (outsideFocus && camera.scale < 0.85) continue;
      const active = n.id === selectedId || n.id === hoverId;
      const label = truncateLabel(n.title, n.kind);
      const x = n.x + nodeRadius(n) + 8;
      const y = n.y + 4 / camera.scale;
      drawPillLabel(ctx, label, x, y, {
        fontPx: active ? fontPx + 1 : fontPx,
        bg: active ? "rgba(4, 22, 18, 0.96)" : "rgba(6, 10, 16, 0.94)",
        border: active ? "rgba(125, 211, 192, 0.9)" : "rgba(236, 244, 252, 0.62)",
        fg: "#ffffff",
        weight: "700",
      });
      const props = nodePropLines(n, active);
      props.forEach((line, i) => {
        drawPillLabel(ctx, line, x, y + step * (i + 1), {
          fontPx: propPx,
          bg: "rgba(16, 28, 42, 0.92)",
          border: "rgba(186, 206, 226, 0.45)",
          fg: "#e7f0f8",
          weight: "600",
          padY: 3,
        });
      });
    }
  }

  function draw(state) {
    const { ctx, vw, vh, nodes, links } = state;
    ctx.clearRect(0, 0, vw, vh);
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.scale, camera.scale);

    const focus = selectedId || hoverId;
    const neigh = focus ? neighborIds(focus) : null;

    drawLinks(ctx, links, focus, vw, vh);
    drawNodes(ctx, nodes, neigh);
    drawLabels(ctx, nodes, neigh, vw, vh);
    ctx.restore();
  }

  function loop() {
    if (!sim) {
      raf = 0;
      return;
    }
    const cont = tick(sim);
    draw(sim);
    if (!cont && pendingFit) {
      pendingFit = false;
      fitToView();
      draw(sim);
    }
    if (cont || drag?.mode === "node") raf = requestAnimationFrame(loop);
    else raf = 0;
  }

  function requestDraw() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function bump() {
    if (sim) sim.alpha = Math.max(sim.alpha, 0.28);
    requestDraw();
  }

  function fitToView(padding = 56) {
    if (!sim?.nodes?.length || !els.canvas) {
      camera = { x: 0, y: 0, scale: 1 };
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of sim.nodes) {
      const r = nodeRadius(n);
      minX = Math.min(minX, n.x - r);
      minY = Math.min(minY, n.y - r);
      maxX = Math.max(maxX, n.x + r);
      maxY = Math.max(maxY, n.y + r);
    }
    const bw = Math.max(60, maxX - minX);
    const bh = Math.max(60, maxY - minY);
    const rect = els.canvas.getBoundingClientRect();
    const raw = Math.min((rect.width - padding * 2) / bw, (rect.height - padding * 2) / bh);
    // More nodes → slightly more zoomed-out default (Obsidian global graph feel)
    const crowd = Math.min(1, 55 / Math.sqrt(sim.nodes.length));
    camera.scale = clampZoom(raw * (0.78 + 0.2 * crowd));
    camera.x = rect.width / 2 - ((minX + maxX) / 2) * camera.scale;
    camera.y = rect.height / 2 - ((minY + maxY) / 2) * camera.scale;
    updateMeta(sim.nodes, sim.links);
  }

  function zoomAt(sx, sy, factor) {
    const wx = (sx - camera.x) / camera.scale;
    const wy = (sy - camera.y) / camera.scale;
    const next = clampZoom(camera.scale * factor);
    camera.x = sx - wx * next;
    camera.y = sy - wy * next;
    camera.scale = next;
    updateMeta(sim?.nodes || [], sim?.links || []);
    requestDraw();
  }

  function zoomTowardCenter(factor) {
    if (!els.canvas) return;
    const r = els.canvas.getBoundingClientRect();
    zoomAt(r.width / 2, r.height / 2, factor);
  }

  function updateMeta(nodes, edges) {
    if (els.meta) {
      els.meta.textContent = `${nodes.length} โน้ตที่แสดง · ${edges.length} ลิงก์ · ซูม ${Math.round(camera.scale * 100)}%`;
    }
    if (els.statsBar && graph?.stats) {
      const s = graph.stats;
      els.statsBar.innerHTML = `
        <span><strong>${s.nodes}</strong> โน้ตทั้งหมด</span>
        <span><strong>${s.edges}</strong> ลิงก์</span>
        <span><strong>${s.unresolved || 0}</strong> ลิงก์ค้าง</span>
        <span>อัปเดต ${escapeHtml((graph.generated_at || "").replace("T", " ").slice(0, 16))}</span>
      `;
    }
  }

  function restartSim(preserveCam = true, autoFit = false) {
    if (raf) cancelAnimationFrame(raf);
    const nodes = visibleNodes();
    const ids = new Set(nodes.map((n) => n.id));
    const edges = visibleEdges(ids);
    if (sim) {
      const prev = new Map(sim.nodes.map((n) => [n.id, n]));
      for (const n of nodes) {
        const p = prev.get(n.id);
        if (p) {
          n.x = p.x;
          n.y = p.y;
          n.vx = p.vx;
          n.vy = p.vy;
        }
      }
    }
    if (!preserveCam) camera = { x: 0, y: 0, scale: 1 };
    sim = initSim(nodes, edges);
    pendingFit = autoFit || !preserveCam;
    updateMeta(nodes, edges);
    raf = requestAnimationFrame(loop);
  }

  function hitTest(wx, wy) {
    if (!sim) return null;
    let best = null;
    let bestD = Infinity;
    for (const n of sim.nodes) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      const thresh = nodeRadius(n) + 5 / camera.scale;
      if (d <= thresh && d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  function showDetail(node) {
    selectedId = node ? node.id : null;
    if (!els.detail) return;
    if (!node) {
      els.detail.innerHTML = `
        <div class="brain-detail-placeholder">
          <p class="brain-kind">เลือกโหนด</p>
          <h3>คลิกจุดบนกราฟ</h3>
          <p class="muted">โหนดใหญ่ = หัวข่าว · โหนดเล็ก = เอนทิตี/ประเภท (แบบ Obsidian)</p>
        </div>`;
      requestDraw();
      return;
    }
    const incoming = (graph.edges || []).filter((e) => e.target === node.id);
    const outgoing = (graph.edges || []).filter((e) => e.source === node.id);
    const nameOf = (id) => graph.nodes.find((n) => n.id === id)?.title || id;

    const tagList = node.tags || [];
    const tagSpans = tagList.map((t) => "<span>" + escapeHtml(t) + "</span>").join("");
    const tagsHtml = tagList.length ? '<p class="brain-tags">' + tagSpans + "</p>" : "";

    els.detail.innerHTML = `
      <p class="brain-kind">${escapeHtml(KIND_LABEL[node.kind] || node.kind)}</p>
      <h3>${escapeHtml(node.title)}</h3>
      <p class="brain-help-inline">${escapeHtml(KIND_HELP[node.kind] || "")}</p>
      <p class="muted brain-path">${escapeHtml(node.path || node.id)}</p>
      <dl class="brain-dl">
        ${node.date ? `<div><dt>วันที่</dt><dd>${escapeHtml(node.date)}</dd></div>` : ""}
        ${node.bureau ? `<div><dt>หน่วยงาน</dt><dd>${escapeHtml(node.bureau)}</dd></div>` : ""}
        ${node.crime_type ? `<div><dt>ประเภท</dt><dd>${escapeHtml(node.crime_type)}</dd></div>` : ""}
        ${node.status ? `<div><dt>สถานะ</dt><dd>${escapeHtml(node.status)}</dd></div>` : ""}
        ${node.entity_group ? `<div><dt>กลุ่มเอนทิตี</dt><dd>${escapeHtml(node.entity_group)}</dd></div>` : ""}
        <div><dt>องศาลิงก์</dt><dd>${node.degree || 0}</dd></div>
      </dl>
      ${tagsHtml}
      ${node.excerpt ? `<p class="brain-excerpt">${escapeHtml(node.excerpt)}</p>` : ""}
      <div class="brain-detail-actions">
        <button type="button" class="btn-ghost" data-action="isolate">${filters.isolate ? "แสดงทั้งกราฟ" : "โฟกัสเพื่อนบ้าน"}</button>
        <button type="button" class="btn-ghost" data-action="center">จัดกลาง</button>
      </div>
      <div class="brain-links">
        <div><strong>ลิงก์ออก (${outgoing.length})</strong><ul>${
          outgoing.length
            ? outgoing
                .slice(0, 16)
                .map(
                  (e) =>
                    `<li><button type="button" data-goto="${escapeHtml(e.target)}">${escapeHtml(relationLabel(e.label) || "กล่าวถึง")} → ${escapeHtml(nameOf(e.target))}</button></li>`
                )
                .join("")
            : "<li class='muted'>—</li>"
        }</ul></div>
        <div><strong>ลิงก์เข้า (${incoming.length})</strong><ul>${
          incoming.length
            ? incoming
                .slice(0, 16)
                .map(
                  (e) =>
                    `<li><button type="button" data-goto="${escapeHtml(e.source)}">${escapeHtml(relationLabel(e.label) || "กล่าวถึง")} ← ${escapeHtml(nameOf(e.source))}</button></li>`
                )
                .join("")
            : "<li class='muted'>—</li>"
        }</ul></div>
      </div>
    `;
    requestDraw();
  }

  function selectById(id) {
    const node = graph?.nodes.find((n) => n.id === id);
    if (!node) return;
    if (!filters.kinds.has(node.kind)) {
      filters.kinds.add(node.kind);
      syncKindChecks();
    }
    showDetail(node);
    restartSim(true);
    if (sim) {
      const n = sim.nodes.find((x) => x.id === id);
      if (n && els.canvas) {
        const r = els.canvas.getBoundingClientRect();
        const targetScale = clampZoom(Math.max(camera.scale, 1.15));
        camera.scale = targetScale;
        camera.x = r.width / 2 - n.x * camera.scale;
        camera.y = r.height / 2 - n.y * camera.scale;
        updateMeta(sim.nodes, sim.links);
      }
    }
    bump();
  }

  function syncKindChecks() {
    document.querySelectorAll("[data-kind-check]").forEach((el) => {
      el.checked = filters.kinds.has(el.dataset.kindCheck);
    });
    renderLegend();
  }

  function renderLegend() {
    if (!els.legend) return;
    const counts = graph?.stats?.by_kind || {};
    els.legend.innerHTML = Object.keys(KIND_LABEL)
      .filter((k) => counts[k] != null || k === "unresolved")
      .map((k) => {
        const on = filters.kinds.has(k);
        return `<button type="button" class="brain-legend-item ${on ? "is-active" : ""}" data-kind="${k}" title="${escapeHtml(KIND_HELP[k] || "")}">
          <i style="background:${KIND_COLOR[k]}"></i>${KIND_LABEL[k]} <span>${counts[k] || 0}</span>
        </button>`;
      })
      .join("");
  }

  function compareText(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  function fillEntityGroups() {
    const sel = $("brain-entity-group");
    if (!sel || !graph) return;
    const groups = [
      ...new Set(
        graph.nodes.filter((n) => n.kind === "entity" && n.entity_group).map((n) => n.entity_group)
      ),
    ].sort(compareText);
    const cur = filters.entityGroup;
    sel.innerHTML =
      `<option value="">ทุกกลุ่มเอนทิตี</option>` +
      groups.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
    sel.value = cur;
  }

  function fillBureaus() {
    const sel = $("brain-bureau");
    if (!sel || !graph) return;
    const bureaus = [
      ...new Set(graph.nodes.filter((n) => n.kind === "case" && n.bureau && n.bureau !== "-").map((n) => n.bureau)),
    ].sort(compareText);
    const cur = filters.bureau;
    sel.innerHTML =
      `<option value="">ทุกหน่วยงาน</option>` +
      bureaus.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
    sel.value = cur;
  }

  function fillRelations() {
    const sel = $("brain-relation");
    if (!sel || !graph) return;
    const counts = new Map();
    for (const e of graph.edges || []) {
      const raw = String(e.label ?? "").trim();
      if (!raw) continue;
      const display = relationLabel(raw);
      counts.set(display, (counts.get(display) || 0) + 1);
    }
    const labels = [...counts.keys()].sort((a, b) => a.localeCompare(b, "th"));
    const cur = filters.relation;
    sel.innerHTML =
      `<option value="">ทุกความสัมพันธ์</option>` +
      labels
        .map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)} (${counts.get(g)})</option>`)
        .join("");
    if (cur && labels.includes(cur)) sel.value = cur;
    else {
      sel.value = "";
      filters.relation = "";
    }
  }

  function renderHelp() {
    if (!els.help) return;
    els.help.innerHTML = `
      <h3>ข้อมูลกราฟคืออะไร?</h3>
      <p>สำเนากราฟจากคลัง Obsidian ตอน publish — โหนดใหญ่คือหัวข่าว (คดี)
      โหนดเล็กคือเอนทิตี/ประเภทที่คดีพูดถึง ป้ายเส้นเป็นภาษาไทย (เช่น จับโดย, สืบสวนโดย, เกี่ยวข้องกับ, กล่าวถึง)
      เมื่อซูมเข้า ชี้ หรือเลือกโหนด จะเห็นคุณสมบัติบนโหนด (หน่วยงาน พื้นที่ ประเภท หรือกลุ่มเอนทิตี)</p>
      <h3>วิธีใช้</h3>
      <ul>
        <li><strong>คลิก</strong> จุด = เปิดรายละเอียด</li>
        <li><strong>ลากจุด</strong> = จัดตำแหน่ง</li>
        <li><strong>ลากพื้นหลัง</strong> = เลื่อนมุมมอง (pan)</li>
        <li><strong>สกอร์ล</strong> = ซูมเข้า/ออก (ช่วงกว้าง)</li>
        <li><strong>พอดี</strong> = จัดให้เห็นทั้งกราฟตามจำนวนโหนด</li>
        <li><strong>ดับเบิลคลิก</strong> = โฟกัสเพื่อนบ้านของโหนด</li>
      </ul>
      <h3>ขนาดโหนด</h3>
      <ul>
        <li><strong>คดี (ข่าว)</strong> — ใหญ่ที่สุด เป็นฮับหลัก</li>
        <li><strong>ประเภท</strong> — กลาง</li>
        <li><strong>เอนทิตี</strong> — เล็ก เกาะรอบคดี</li>
      </ul>
    `;
  }

  function applyFiltersFromDom() {
    filters.q = $("brain-search")?.value || "";
    filters.minDegree = Number($("brain-min-degree")?.value || 0);
    filters.dateFrom = $("brain-date-from")?.value || "";
    filters.dateTo = $("brain-date-to")?.value || "";
    filters.entityGroup = $("brain-entity-group")?.value || "";
    filters.bureau = $("brain-bureau")?.value || "";
    filters.relation = $("brain-relation")?.value || "";
    filters.hideOrphans = Boolean($("brain-hide-orphans")?.checked);
    filters.showLabels = $("brain-labels")?.value || "auto";
    const kinds = new Set();
    document.querySelectorAll("[data-kind-check]:checked").forEach((el) => {
      kinds.add(el.dataset.kindCheck);
    });
    if (kinds.size) filters.kinds = kinds;
    showDetail(selectedId ? graph.nodes.find((n) => n.id === selectedId) : null);
    restartSim(true, true);
  }

  function resetAll() {
    filters = {
      kinds: new Set(["case", "entity", "crime_type", "daily", "unresolved", "other"]),
      q: "",
      minDegree: 0,
      dateFrom: "",
      dateTo: "",
      entityGroup: "",
      bureau: "",
      hideOrphans: false,
      isolate: false,
      showLabels: "auto",
      relation: "",
    };
    camera = { x: 0, y: 0, scale: 1 };
    selectedId = null;
    hoverId = null;
    if ($("brain-search")) $("brain-search").value = "";
    if ($("brain-min-degree")) $("brain-min-degree").value = "0";
    if ($("brain-date-from")) $("brain-date-from").value = "";
    if ($("brain-date-to")) $("brain-date-to").value = "";
    if ($("brain-entity-group")) $("brain-entity-group").value = "";
    if ($("brain-bureau")) $("brain-bureau").value = "";
    if ($("brain-relation")) $("brain-relation").value = "";
    if ($("brain-hide-orphans")) $("brain-hide-orphans").checked = false;
    if ($("brain-isolate")) $("brain-isolate").checked = false;
    if ($("brain-labels")) $("brain-labels").value = "auto";
    syncKindChecks();
    if (sim) {
      for (const n of sim.nodes) {
        n.x = undefined;
        n.y = undefined;
      }
    }
    showDetail(null);
    restartSim(false, true);
  }

  function bindCanvas() {
    if (bound || !els.canvas) return;
    bound = true;
    const canvas = els.canvas;

    canvas.addEventListener(
      "wheel",
      (ev) => {
        ev.preventDefault();
        const p = worldFromEvent(ev);
        const factor = ev.deltaY < 0 ? 1.14 : 1 / 1.14;
        zoomAt(p.sx, p.sy, factor);
      },
      { passive: false }
    );

    canvas.addEventListener("pointerdown", (ev) => {
      const p = worldFromEvent(ev);
      const hit = hitTest(p.x, p.y);
      if (hit) {
        drag = {
          mode: "node",
          id: hit.id,
          x: p.x,
          y: p.y,
          startX: p.sx,
          startY: p.sy,
          moved: false,
        };
        showDetail(hit);
      } else {
        drag = {
          mode: "pan",
          startX: p.sx,
          startY: p.sy,
          camX: camera.x,
          camY: camera.y,
          moved: false,
        };
      }
      canvas.setPointerCapture(ev.pointerId);
      if (drag.mode === "node") bump();
      else requestDraw();
    });

    canvas.addEventListener("pointermove", (ev) => {
      const p = worldFromEvent(ev);
      if (!drag) {
        const hit = hitTest(p.x, p.y);
        const nid = hit?.id || null;
        if (nid !== hoverId) {
          hoverId = nid;
          canvas.style.cursor = hit ? "pointer" : "grab";
          requestDraw();
        }
        return;
      }
      drag.moved =
        drag.moved ||
        Math.hypot(p.sx - (drag.startX || 0), p.sy - (drag.startY || 0)) > 4;
      if (drag.mode === "node") {
        drag.x = p.x;
        drag.y = p.y;
        bump();
      } else {
        camera.x = drag.camX + (p.sx - drag.startX);
        camera.y = drag.camY + (p.sy - drag.startY);
        requestDraw();
      }
    });

    const endDrag = () => {
      const wasNode = drag?.mode === "node";
      drag = null;
      if (wasNode) bump();
      else requestDraw();
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    canvas.addEventListener("dblclick", (ev) => {
      const p = worldFromEvent(ev);
      const hit = hitTest(p.x, p.y);
      if (!hit) {
        fitToView();
        requestDraw();
        return;
      }
      filters.isolate = true;
      if ($("brain-isolate")) $("brain-isolate").checked = true;
      showDetail(hit);
      restartSim(true, true);
      selectById(hit.id);
    });
  }

  async function mount() {
    els.canvas = $("brain-canvas");
    els.meta = $("brain-meta");
    els.detail = $("brain-detail");
    els.legend = $("brain-legend");
    els.status = $("brain-status");
    els.empty = $("brain-empty");
    els.help = $("brain-help");
    els.statsBar = $("brain-stats");
    if (!els.canvas) return;

    try {
      if (els.status) els.status.textContent = "กำลังโหลดข้อมูลกราฟ…";
      graph = await loadGraph();
      const n = graph.stats?.nodes || graph.nodes?.length || 0;
      if (!n) {
        if (els.empty) els.empty.hidden = false;
        if (els.status) els.status.textContent = "ยังไม่มีกราฟ";
        return;
      }
      if (els.empty) els.empty.hidden = true;
      if (els.status) {
        els.status.textContent = "ข้อมูลกราฟ · โหนดใหญ่ = ข่าว · ซูมเพื่ออ่านป้ายและคุณสมบัติ";
      }
      renderHelp();
      fillEntityGroups();
      fillBureaus();
      fillRelations();
      renderLegend();
      syncKindChecks();
      showDetail(null);
      restartSim(false, true);
      bindCanvas();
    } catch (e) {
      if (els.empty) els.empty.hidden = false;
      if (els.status) els.status.textContent = e.message || String(e);
    }
  }

  function wireOnce() {
    if (els._wired) return;
    els._wired = true;

    const onFilter = () => applyFiltersFromDom();
    ["brain-search", "brain-min-degree", "brain-date-from", "brain-date-to", "brain-entity-group", "brain-bureau", "brain-relation", "brain-labels"].forEach(
      (id) => {
        $(id)?.addEventListener("change", onFilter);
        $(id)?.addEventListener("input", () => {
          if (id === "brain-search") {
            clearTimeout(els._st);
            els._st = setTimeout(onFilter, 160);
          }
        });
      }
    );
    $("brain-hide-orphans")?.addEventListener("change", onFilter);
    $("brain-isolate")?.addEventListener("change", (e) => {
      filters.isolate = e.target.checked;
      restartSim(true, true);
      showDetail(selectedId ? graph.nodes.find((n) => n.id === selectedId) : null);
    });

    $("brain-kind-checks")?.addEventListener("change", onFilter);

    $("brain-legend")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-kind]");
      if (!btn) return;
      const k = btn.dataset.kind;
      if (filters.kinds.has(k) && filters.kinds.size === 1) {
        filters.kinds = new Set(["case", "entity", "crime_type", "daily", "unresolved", "other"]);
      } else if (filters.kinds.has(k) && filters.kinds.size > 1) {
        filters.kinds = new Set([k]);
      } else {
        filters.kinds = new Set([k]);
      }
      syncKindChecks();
      showDetail(null);
      restartSim(true, true);
    });

    $("brain-detail")?.addEventListener("click", (e) => {
      const goto = e.target.closest("[data-goto]");
      const gotoId = goto ? goto.dataset.goto : "";
      if (gotoId) {
        selectById(gotoId);
        return;
      }
      const act = e.target.closest("[data-action]");
      if (!act) return;
      const actionName = act.dataset.action || "";
      if (actionName === "isolate") {
        filters.isolate = !filters.isolate;
        if ($("brain-isolate")) $("brain-isolate").checked = filters.isolate;
        restartSim(true, true);
        showDetail(selectedId ? graph.nodes.find((n) => n.id === selectedId) : null);
      }
      if (actionName === "center" && selectedId) selectById(selectedId);
    });

    $("brain-reset")?.addEventListener("click", resetAll);
    $("brain-zoom-in")?.addEventListener("click", () => zoomTowardCenter(1.22));
    $("brain-zoom-out")?.addEventListener("click", () => zoomTowardCenter(1 / 1.22));
    $("brain-zoom-fit")?.addEventListener("click", () => {
      fitToView();
      requestDraw();
    });

    window.addEventListener("resize", () => {
      if ($("view-brain")?.hidden) return;
      restartSim(true, true);
    });
  }

  function matchCaseKeys(post) {
    return [post?.case_id, post?.id, post?.slug].filter(Boolean).map(String);
  }

  function findCaseNode(postOrId) {
    if (!graph?.nodes) return null;
    const keys =
      typeof postOrId === "string" || typeof postOrId === "number"
        ? [String(postOrId)]
        : matchCaseKeys(postOrId);
    if (!keys.length) return null;
    return (
      graph.nodes.find(
        (n) =>
          n.kind === "case" &&
          keys.some(
            (k) =>
              n.case_id === k ||
              n.id === k ||
              n.id.endsWith("/" + k) ||
              n.path?.includes(k)
          )
      ) || null
    );
  }

  function egoForHub(hub) {
    if (!hub || !graph) return { hub: null, nodes: [], edges: [], relations: [] };
    const edges = (graph.edges || []).filter((e) => e.source === hub.id || e.target === hub.id);
    const ids = new Set([hub.id]);
    for (const e of edges) {
      ids.add(e.source);
      ids.add(e.target);
    }
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const nodes = [...ids].map((id) => byId.get(id)).filter(Boolean);
    const relations = edges.map((e) => {
      const otherId = e.source === hub.id ? e.target : e.source;
      const other = byId.get(otherId);
      return {
        label: e.label || "mentions",
        target_id: otherId,
        target_title: other?.title || otherId,
        target_kind: other?.kind || "",
        direction: e.source === hub.id ? "out" : "in",
      };
    });
    return { hub, nodes, edges, relations };
  }

  function truncateStory(s, max) {
    const t = String(s || "").trim();
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + "…";
  }

  function egoKindColor(kind) {
    return KIND_COLOR[kind] || KIND_COLOR.other;
  }

  function egoSatelliteRadius(kind) {
    if (kind === "crime_type") return 13;
    if (kind === "case") return 15;
    return 10;
  }

  function buildEgoSvg(hub, neighbors, edges) {
    const W = 720;
    const H = 400;
    const cx = W / 2;
    const cy = H / 2 + 10;
    const positions = new Map();
    positions.set(hub.id, { x: cx, y: cy, r: 20 });
    const n = neighbors.length;
    const radius = Math.min(160, 64 + n * 11);
    neighbors.forEach((node, i) => {
      const angle = (Math.PI * 2 * i) / Math.max(1, n) - Math.PI / 2;
      const r = egoSatelliteRadius(node.kind);
      positions.set(node.id, {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        r,
      });
    });

    const parts = [];
    for (const e of edges) {
      const a = positions.get(e.source);
      const b = positions.get(e.target);
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      parts.push(
        `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#6a7c8e" stroke-width="1.5" opacity="0.8"/>`
      );
      const relName = relationLabel(e.label);
      if (relName) {
        const shown = truncateStory(relName, 18);
        const pillW = Math.max(56, 14 + shown.length * 7.2);
        parts.push(
          `<rect x="${(mx - pillW / 2).toFixed(1)}" y="${(my - 9).toFixed(1)}" width="${pillW.toFixed(1)}" height="16" rx="8" fill="#10211e" stroke="#7dd3c0"/>` +
            `<text x="${mx.toFixed(1)}" y="${(my + 3).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#ffffff" font-family="Sarabun, Anuphan, sans-serif">${escapeHtml(shown)}</text>`
        );
      }
    }

    for (const node of [hub, ...neighbors]) {
      const p = positions.get(node.id);
      if (!p) continue;
      const title = truncateStory(node.title, node.id === hub.id ? 34 : 24);
      const pillW = Math.min(200, 10 + title.length * 6.8);
      parts.push(
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r}" fill="${egoKindColor(node.kind)}" stroke="#fff" stroke-width="2"/>`,
        `<rect x="${(p.x - pillW / 2).toFixed(1)}" y="${(p.y + p.r + 4).toFixed(1)}" width="${pillW.toFixed(1)}" height="16" rx="8" fill="rgba(255,255,255,0.95)" stroke="#c5d0da"/>` +
          `<text x="${p.x.toFixed(1)}" y="${(p.y + p.r + 15).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="600" fill="#1a222c" font-family="Sarabun, Anuphan, sans-serif">${escapeHtml(title)}</text>`
      );
      if (node.id === hub.id) {
        const props = [hub.bureau, hub.area, hub.crime_type, hub.status]
          .filter((x) => x && x !== "-")
          .slice(0, 3);
        props.forEach((line, i) => {
          parts.push(
            `<text x="${p.x.toFixed(1)}" y="${(p.y + p.r + 30 + i * 12).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="#4a5a68" font-family="Sarabun, Anuphan, sans-serif">${escapeHtml(truncateStory(line, 30))}</text>`
          );
        });
      } else if (node.kind === "entity" && node.entity_group) {
        parts.push(
          `<text x="${p.x.toFixed(1)}" y="${(p.y + p.r + 28).toFixed(1)}" text-anchor="middle" font-size="9" fill="#4a5a68" font-family="Sarabun, Anuphan, sans-serif">${escapeHtml(truncateStory(node.entity_group, 20))}</text>`
        );
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="auto" class="story-ego-svg" role="img" aria-label="ข้อมูลกราฟของข่าวนี้">${parts.join("")}</svg>`;
  }

  function relationsFromPost(post, graphRels) {
    const list = [...(graphRels || [])];
    const seen = new Set(list.map((r) => `${r.label}|${r.target_id}`));
    for (const r of post?.related_cases || []) {
      const tid = r.id || r.case_id || "";
      const key = `${r.relation || "related_to"}|${tid}`;
      if (!tid || seen.has(key)) continue;
      seen.add(key);
      list.push({
        label: r.relation || "related_to",
        target_id: tid,
        target_title: r.title || tid,
        target_kind: "case",
        direction: "out",
      });
    }
    return list;
  }

  async function ensureGraph() {
    if (!graph) {
      try {
        graph = await loadGraph();
      } catch {
        graph = null;
      }
    }
    return graph;
  }

  const storyPayloads = new Map();

  function blogHashForNode(node) {
    if (!node || node.kind !== "case" || !node.date || !node.case_id) return "";
    return `#/${node.date}/${encodeURIComponent(node.case_id)}`;
  }

  function nodeByAnyId(id) {
    if (!graph || !id) return null;
    return graph.nodes.find((n) => n.id === id || n.case_id === id) || null;
  }

  function storyLabel(node) {
    const max = node.kind === "case" ? 26 : 16;
    return truncateStory(node.title || node.case_id || node.id, max);
  }

  function storyRingRadius(count) {
    const n = Math.max(1, count);
    if (n <= 1) return 210;
    return Math.max(210, 120 / (2 * Math.sin(Math.PI / n)));
  }

  function placeStoryNodes(hub, neighbors) {
    const n = Math.max(1, neighbors.length);
    const radius = storyRingRadius(n);
    const cx = radius + 160;
    const cy = radius + 90;
    const placed = [{ node: hub, x: cx, y: cy, r: 24, vx: 0, vy: 0 }];
    neighbors.forEach((node, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      placed.push({
        node,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        r: node.kind === "case" ? 18 : 13,
        vx: 0,
        vy: 0,
      });
    });
    return placed;
  }

  function screenOfStory(job, x, y) {
    return {
      x: x * job.camera.scale + job.camera.x,
      y: y * job.camera.scale + job.camera.y,
    };
  }

  function storyBoxesOverlap(a, b, gap) {
    return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
  }

  function pushStoryBoxes(a, b) {
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (overlapX <= 0 || overlapY <= 0) return false;
    if (overlapX < overlapY) {
      const push = overlapX / 2 + 4;
      if (a.x <= b.x) {
        a.x -= push;
        b.x += push;
      } else {
        a.x += push;
        b.x -= push;
      }
      return true;
    }
    const pushY = overlapY / 2 + 4;
    if (a.y <= b.y) {
      a.y -= pushY;
      b.y += pushY;
    } else {
      a.y += pushY;
      b.y -= pushY;
    }
    return true;
  }

  function separateStoryBoxes(boxes) {
    for (let pass = 0; pass < 28; pass += 1) {
      let moved = false;
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          if (pushStoryBoxes(boxes[i], boxes[j])) moved = true;
        }
      }
      if (!moved) break;
    }
  }

  function clampStoryBox(box, w, h) {
    box.x = Math.max(6, Math.min(w - box.w - 6, box.x));
    box.y = Math.max(6, Math.min(h - box.h - 6, box.y));
  }

  function liftLabelOffNode(box) {
    const pad = 20;
    const nearestX = Math.max(box.x, Math.min(box.anchorX, box.x + box.w));
    const nearestY = Math.max(box.y, Math.min(box.anchorY, box.y + box.h));
    const dist = Math.hypot(nearestX - box.anchorX, nearestY - box.anchorY);
    if (dist >= pad) return;
    let ux = box.x + box.w / 2 - box.anchorX;
    let uy = box.y + box.h / 2 - box.anchorY;
    let len = Math.hypot(ux, uy);
    if (len < 6) {
      ux = 0;
      uy = -1;
      len = 1;
    }
    const push = pad - dist + box.h / 2 + 6;
    box.x += (ux / len) * push;
    box.y += (uy / len) * push;
  }

  function storyLabelLines(text) {
    if (text.length <= 16) return [text];
    const mid = Math.ceil(text.length / 2);
    return [text.slice(0, mid).trim(), text.slice(mid).trim()];
  }

  function storyScreenLabels(job) {
    const hub = job.placed[0];
    const hubAt = screenOfStory(job, hub.x, hub.y);
    const boxes = job.placed.map((p) => {
      const lines = storyLabelLines(storyLabel(p.node));
      job.ctx.font = "600 13px Sarabun, Anuphan, sans-serif";
      const longest = lines.reduce((max, line) => Math.max(max, job.ctx.measureText(line).width), 24);
      const w = Math.max(76, Math.ceil(longest) + 18);
      const h = 10 + lines.length * 16;
      const at = screenOfStory(job, p.x, p.y);
      let dx = at.x - hubAt.x;
      let dy = at.y - hubAt.y;
      let len = Math.hypot(dx, dy);
      if (len < 1) {
        dx = 0;
        dy = -1;
        len = 1;
      }
      const reach = p.r * job.camera.scale + 12;
      const cx = at.x + (dx / len) * (reach + w / 2);
      const cy = at.y + (dy / len) * (reach + h / 2);
      let x = cx - w / 2;
      let y = cy - h / 2;
      const offTop = y < 8;
      const offBottom = y + h > job.h - 8;
      if (offTop || offBottom) {
        const side = at.x > job.w * 0.55 ? 1 : -1;
        x = at.x + side * (p.r * job.camera.scale + 14);
        if (side < 0) x -= w;
        y = at.y - h / 2;
      }
      return {
        id: p.node.id,
        text: lines.join(" "),
        lines,
        w,
        h,
        x,
        y,
        anchorX: at.x,
        anchorY: at.y,
      };
    });
    separateStoryBoxes(boxes);
    for (let pass = 0; pass < 4; pass += 1) {
      for (const box of boxes) liftLabelOffNode(box);
      separateStoryBoxes(boxes);
    }
    for (const box of boxes) clampStoryBox(box, job.w, job.h);
    const hubBox = boxes.find((box) => box.id === job.hubId);
    if (hubBox) {
      const reach = (job.placed[0].r || 24) * job.camera.scale + 18;
      hubBox.x = hubBox.anchorX - hubBox.w / 2;
      hubBox.y = hubBox.anchorY - reach - hubBox.h;
      clampStoryBox(hubBox, job.w, job.h);
      for (let pass = 0; pass < 10; pass += 1) {
        for (const box of boxes) {
          if (box !== hubBox) shoveOff(box, hubBox, job.h);
        }
      }
      for (const box of boxes) clampStoryBox(box, job.w, job.h);
    }
    for (const box of boxes) liftLabelOffNode(box);
    return boxes;
  }

  function shoveOff(box, fixed, boundsH) {
    const overlapX = Math.min(box.x + box.w, fixed.x + fixed.w) - Math.max(box.x, fixed.x);
    const overlapY = Math.min(box.y + box.h, fixed.y + fixed.h) - Math.max(box.y, fixed.y);
    if (overlapX <= 0 || overlapY <= 0) return;
    const pushX = overlapX + 6;
    const pushY = overlapY + 6;
    const nextY = box.y + (box.y < fixed.y ? -pushY : pushY);
    const staysOnCanvas = nextY >= 6 && nextY + box.h <= boundsH - 6;
    if (overlapY < overlapX && staysOnCanvas) {
      box.y = nextY;
      return;
    }
    box.x += box.x < fixed.x ? -pushX : pushX;
  }

  function storyEdgePills(job, nodeBoxes) {
    const byPos = new Map(job.placed.map((p) => [p.node.id, p]));
    job.ctx.font = "600 13px Sarabun, Anuphan, sans-serif";
    const pills = [];
    for (const edge of job.edges) {
      const a = byPos.get(edge.source);
      const b = byPos.get(edge.target);
      const name = relationLabel(edge.label);
      if (!a || !b || !name) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const at = screenOfStory(job, a.x + dx * 0.56 + (-dy / len) * 26, a.y + dy * 0.56 + (dx / len) * 26);
      const w = Math.max(64, Math.ceil(job.ctx.measureText(name).width) + 16);
      pills.push({ text: name, w, h: 20, x: at.x - w / 2, y: at.y - 10 });
    }
    separateStoryBoxes(pills);
    const clear = [];
    for (const pill of pills) {
      clampStoryBox(pill, job.w, job.h);
      const blocked = nodeBoxes.some((box) => storyBoxesOverlap(box, pill, 6))
        || clear.some((other) => storyBoxesOverlap(other, pill, 6));
      if (!blocked) clear.push(pill);
    }
    return clear;
  }

  function drawScreenPill(ctx, box, dark) {
    ctx.fillStyle = dark ? "#10211e" : "rgba(255,255,255,0.97)";
    ctx.strokeStyle = dark ? "#7dd3c0" : "#9aafc0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const r = Math.min(8, box.h / 2);
    ctx.moveTo(box.x + r, box.y);
    ctx.arcTo(box.x + box.w, box.y, box.x + box.w, box.y + box.h, r);
    ctx.arcTo(box.x + box.w, box.y + box.h, box.x, box.y + box.h, r);
    ctx.arcTo(box.x, box.y + box.h, box.x, box.y, r);
    ctx.arcTo(box.x, box.y, box.x + box.w, box.y, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = dark ? "#ffffff" : "#1a222c";
    ctx.font = "600 13px Sarabun, Anuphan, sans-serif";
    ctx.textBaseline = "middle";
    const lines = box.lines || [box.text];
    lines.forEach((line, index) => {
      ctx.fillText(line, box.x + 8, box.y + 8 + index * 16 + 6);
    });
  }

  function drawStoryLabelLeaders(ctx, boxes) {
    ctx.save();
    ctx.strokeStyle = "#8aa0b4";
    ctx.lineWidth = 1;
    for (const box of boxes) {
      const cx = box.x + box.w / 2;
      const dist = Math.hypot(cx - box.anchorX, box.y + box.h / 2 - box.anchorY);
      if (dist < 34) continue;
      const y = box.anchorY < box.y ? box.y : box.y + box.h;
      ctx.beginPath();
      ctx.moveTo(box.anchorX, box.anchorY);
      ctx.lineTo(cx, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStoryGraph(job) {
    const { ctx } = job;
    ctx.lineWidth = 1.6 / job.camera.scale;
    ctx.strokeStyle = "#5d7388";
    const byPos = new Map(job.placed.map((p) => [p.node.id, p]));
    for (const edge of job.edges) {
      const a = byPos.get(edge.source);
      const b = byPos.get(edge.target);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const storyFill = {
      case: "#1a6b5c",
      entity: "#2c5f8a",
      crime_type: "#a15c12",
      daily: "#5a7184",
      unresolved: "#9b2c2c",
      other: "#3d5a6c",
    };
    for (const p of job.placed) {
      const linked = Boolean(blogHashForNode(p.node)) && p.node.id !== job.hubId;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = storyFill[p.node.kind] || storyFill.other;
      ctx.fill();
      ctx.lineWidth = (linked ? 3 : 1.6) / job.camera.scale;
      ctx.strokeStyle = linked ? "#0b1c2c" : "#ffffff";
      ctx.stroke();
    }
  }

  function drawStory(job) {
    const { ctx } = job;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, job.w, job.h);
    ctx.save();
    ctx.translate(job.camera.x, job.camera.y);
    ctx.scale(job.camera.scale, job.camera.scale);
    drawStoryGraph(job);
    ctx.restore();
    const labels = storyScreenLabels(job);
    job.labels = labels;
    drawStoryLabelLeaders(ctx, labels);
    for (const pill of storyEdgePills(job, labels)) drawScreenPill(ctx, pill, true);
    for (const box of labels) drawScreenPill(ctx, box, false);
  }

  function fitStoryCamera(job) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of job.placed) {
      minX = Math.min(minX, p.x - p.r);
      minY = Math.min(minY, p.y - p.r);
      maxX = Math.max(maxX, p.x + p.r);
      maxY = Math.max(maxY, p.y + p.r);
    }
    const pad = 128;
    const bw = Math.max(40, maxX - minX);
    const bh = Math.max(40, maxY - minY);
    const scale = Math.min((job.w - pad * 2) / bw, (job.h - pad * 2) / bh);
    job.camera.scale = Math.min(1.8, Math.max(0.45, scale));
    job.camera.x = job.w / 2 - ((minX + maxX) / 2) * job.camera.scale;
    job.camera.y = job.h / 2 - ((minY + maxY) / 2) * job.camera.scale;
  }

  function hitStoryCircle(job, wx, wy) {
    let best = null;
    let bestD = Infinity;
    const pad = 14 / (job.camera.scale || 1);
    for (const p of job.placed) {
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d <= p.r + pad && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  function hitStoryNode(job, p) {
    const boxes = job.labels || [];
    for (let i = boxes.length - 1; i >= 0; i -= 1) {
      const box = boxes[i];
      const inside = p.sx >= box.x && p.sx <= box.x + box.w && p.sy >= box.y && p.sy <= box.y + box.h;
      if (!inside) continue;
      return job.placed.find((row) => row.node.id === box.id) || null;
    }
    return hitStoryCircle(job, p.x, p.y);
  }

  function moveDraggedStoryNode(job, p) {
    const dragged = job.placed.find((row) => row.node.id === job.drag.id);
    if (!dragged) return;
    dragged.x = p.x;
    dragged.y = p.y;
    job.drag.x = p.x;
    job.drag.y = p.y;
  }

  function bindStoryCanvas(canvas, job) {
    if (canvas.dataset.storyBound === "1") return;
    canvas.dataset.storyBound = "1";
    canvas.style.touchAction = "none";
    const world = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * job.w;
      const sy = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * job.h;
      return {
        sx,
        sy,
        x: (sx - job.camera.x) / job.camera.scale,
        y: (sy - job.camera.y) / job.camera.scale,
      };
    };
    canvas.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      const p = world(ev);
      const next = Math.min(2.8, Math.max(0.4, job.camera.scale * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
      job.camera.x = p.sx - p.x * next;
      job.camera.y = p.sy - p.y * next;
      job.camera.scale = next;
      drawStory(job);
    }, { passive: false });
    canvas.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      const p = world(ev);
      const hit = hitStoryNode(job, p);
      job.drag = hit
        ? { mode: "node", id: hit.node.id, x: hit.x, y: hit.y, sx: p.sx, sy: p.sy, moved: false }
        : { mode: "pan", sx: p.sx, sy: p.sy, camX: job.camera.x, camY: job.camera.y, moved: false };
      canvas.style.cursor = "grabbing";
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {
        /* capture is optional; pointermove still updates the graph */
      }
      drawStory(job);
    });
    canvas.addEventListener("pointermove", (ev) => {
      const p = world(ev);
      if (!job.drag) {
        const hit = hitStoryNode(job, p);
        const linked = hit && blogHashForNode(hit.node) && hit.node.id !== job.hubId;
        canvas.style.cursor = linked ? "pointer" : "grab";
        return;
      }
      ev.preventDefault();
      job.drag.moved = job.drag.moved || Math.hypot(p.sx - job.drag.sx, p.sy - job.drag.sy) > 4;
      if (job.drag.mode === "node") moveDraggedStoryNode(job, p);
      else {
        job.camera.x = job.drag.camX + (p.sx - job.drag.sx);
        job.camera.y = job.drag.camY + (p.sy - job.drag.sy);
      }
      canvas.style.cursor = "grabbing";
      drawStory(job);
    });
    canvas.addEventListener("pointerup", (ev) => {
      const drag = job.drag;
      job.drag = null;
      canvas.style.cursor = "grab";
      drawStory(job);
      if (!drag || drag.moved || drag.mode !== "node") return;
      const item = job.placed.find((row) => row.node.id === drag.id);
      const href = item ? blogHashForNode(item.node) : "";
      if (href && item.node.id !== job.hubId) location.hash = href;
      ev.preventDefault();
    });
    canvas.addEventListener("pointercancel", () => {
      job.drag = null;
      canvas.style.cursor = "grab";
      drawStory(job);
    });
  }

  function mountStoryGraphs(root) {
    const canvases = [...(root?.querySelectorAll?.("canvas.story-ego-canvas") || [])];
    requestAnimationFrame(() => {
      canvases.forEach((canvas) => {
        if (!canvas.isConnected) return;
        const payload = storyPayloads.get(canvas.dataset.hub || "");
        if (!payload) return;
        const count = payload.neighbors.length;
        const viewH = Math.max(640, Math.min(980, 560 + Math.max(0, count - 6) * 36));
        canvas.style.height = `${viewH}px`;
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(320, Math.round(rect.width || canvas.clientWidth || 720));
        const h = Math.max(viewH, Math.round(rect.height || viewH));
        canvas.width = Math.floor(w * devicePixelRatio);
        canvas.height = Math.floor(h * devicePixelRatio);
        const placed = placeStoryNodes(payload.hub, payload.neighbors);
        const job = {
          ctx: canvas.getContext("2d"),
          w,
          h,
          hubId: payload.hub.id,
          placed,
          labels: [],
          edges: payload.edges,
          camera: { x: 0, y: 0, scale: 1 },
          drag: null,
        };
        fitStoryCamera(job);
        bindStoryCanvas(canvas, job);
        drawStory(job);
        document.fonts?.ready?.then(() => {
          if (canvas.isConnected) drawStory(job);
        });
      });
    });
  }

  async function storyGraphHtml(post) {
    await ensureGraph();
    const hub = findCaseNode(post);
    const caseKey = hub?.case_id || post?.id || post?.slug || "";
    const staticSvg = caseKey ? `data/graphs/${encodeURIComponent(caseKey)}.svg` : "";

    if (!hub) {
      const postRels = relationsFromPost(post, []);
      const relList = postRels.length
        ? `<ul class="story-rel-list">${postRels
            .map(
              (r) =>
                `<li><span class="story-rel-label">${escapeHtml(relationLabel(r.label) || "กล่าวถึง")}</span> → ${escapeHtml(r.target_title)}</li>`
            )
            .join("")}</ul>`
        : `<p class="muted">ยังไม่มีเส้นความสัมพันธ์ในข้อมูลกราฟสำหรับข่าวนี้</p>`;
      return `
        <section class="analysis-block story-graph-block">
          <h2>ข้อมูลกราฟของข่าวนี้</h2>
          <p class="muted">ยังไม่พบโหนดคดีใน graph.json — แสดงเฉพาะ related_cases จากโพสต์</p>
          ${
            staticSvg
              ? `<img class="story-ego-img" src="${staticSvg}" alt="ข้อมูลกราฟ ${escapeHtml(caseKey)}" loading="lazy" onerror="this.hidden=true" />`
              : ""
          }
          <p class="story-graph-actions"><a class="btn-ghost story-open-graph" href="#/brain">เปิดในกราฟ</a></p>
          <h3 class="story-rel-heading">ความสัมพันธ์</h3>
          ${relList}
          <p class="muted story-graph-link"><a href="#/brain">เปิดแท็บข้อมูลกราฟทั้งหมด</a></p>
        </section>`;
    }

    const { edges, relations } = egoForHub(hub);
    const drawEdges = presentEdges(edges, false);
    const neighMap = new Map();
    for (const e of drawEdges) {
      const oid = e.source === hub.id ? e.target : e.source;
      const n = graph.nodes.find((x) => x.id === oid);
      if (n && n.id !== hub.id) neighMap.set(n.id, n);
    }
    const uniqNeighbors = [...neighMap.values()];
    storyPayloads.set(hub.id, { hub, neighbors: uniqNeighbors, edges: drawEdges });
    const keptEdges = new Set(drawEdges.map((e) => `${e.source}|${e.target}|${e.label}`));
    const shownRels = relations.filter((r) => {
      const source = r.direction === "out" ? hub.id : r.target_id;
      const target = r.direction === "out" ? r.target_id : hub.id;
      return keptEdges.has(`${source}|${target}|${r.label}`);
    });
    const allRels = relationsFromPost(post, shownRels);
    const relList = allRels.length
      ? `<ul class="story-rel-list">${allRels
          .map((r) => {
            const arrow = r.direction === "in" ? "←" : "→";
            const caseNode = r.target_kind === "case" ? nodeByAnyId(r.target_id) : null;
            const blog = blogHashForNode(caseNode);
            const href = blog || `#/brain/${encodeURIComponent(r.target_id || hub.id)}`;
            return `<li><span class="story-rel-label">${escapeHtml(relationLabel(r.label) || "กล่าวถึง")}</span> ${arrow} <a href="${href}">${escapeHtml(r.target_title)}</a></li>`;
          })
          .join("")}</ul>`
      : `<p class="muted">ยังไม่มีเส้นความสัมพันธ์</p>`;

    return `
      <section class="analysis-block story-graph-block">
        <h2>ข้อมูลกราฟของข่าวนี้</h2>
        <p class="muted">ลากวงกลมหรือป้ายชื่อเพื่อขยับโหนด แล้วปล่อยให้ค้างที่นั่น · ลากพื้นที่ว่างเพื่อเลื่อนมุมมอง · สกอร์ลเพื่อซูม · คลิกโหนดข่าวโดยไม่ลากเพื่อเปิดบล็อกนั้น</p>
        <p class="story-graph-actions"><a class="btn-ghost story-open-graph" href="#/brain/${encodeURIComponent(hub.id)}">เปิดในกราฟ</a></p>
        <div class="story-ego-wrap"><canvas class="story-ego-canvas" data-hub="${escapeHtml(hub.id)}" aria-label="ข้อมูลกราฟของข่าวนี้"></canvas></div>
        ${
          staticSvg
            ? `<p class="muted story-ego-static"><a href="${staticSvg}" target="_blank" rel="noopener">เปิดภาพ SVG</a> · <code>data/graphs/${escapeHtml(caseKey)}.svg</code></p>`
            : ""
        }
        <h3 class="story-rel-heading">ความสัมพันธ์ที่เชื่อมกับข่าวนี้</h3>
        ${relList}
        <p class="muted story-graph-link"><a href="#/brain/${encodeURIComponent(hub.id)}">โฟกัสโหนดนี้ในแท็บข้อมูลกราฟ</a></p>
      </section>`;
  }

  window.BrainGraph = {
    async show() {
      wireOnce();
      Object.assign(els, {
        canvas: $("brain-canvas"),
        meta: $("brain-meta"),
        detail: $("brain-detail"),
        legend: $("brain-legend"),
        status: $("brain-status"),
        empty: $("brain-empty"),
        help: $("brain-help"),
        statsBar: $("brain-stats"),
      });
      if (!graph) await mount();
      else {
        renderHelp();
        fillEntityGroups();
        fillBureaus();
        fillRelations();
        renderLegend();
        restartSim(true, true);
      }
    },
    select(id) {
      selectById(id);
    },
    refresh() {
      graph = null;
      bound = false;
      return mount();
    },
    storyGraphHtml,
    mountStoryGraphs,
    findCaseNode,
    relationLabel,
  };
})();
