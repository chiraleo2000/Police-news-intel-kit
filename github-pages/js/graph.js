/**
 * Second Brain graph — Obsidian-like force layout over data/graph.json
 * Case (news) nodes are hubs; entity / crime_type are smaller satellites.
 * Zoom / pan / fit-to-view scale with graph size.
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

  async function loadGraph() {
    const res = await fetch(`data/graph.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("graph.json not found — run node ops/build-obsidian-graph.js");
    return res.json();
  }

  function neighborIds(id) {
    const set = new Set([id]);
    for (const e of graph?.edges || []) {
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
    return nodes;
  }

  function visibleEdges(ids) {
    return (graph?.edges || []).filter((e) => ids.has(e.source) && ids.has(e.target));
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

  function tick(state) {
    const { nodes, links, w, h } = state;
    if (state.alpha < 0.012 && !drag) return false;
    state.alpha *= 0.989;

    const nCount = Math.max(1, nodes.length);
    const repulse = 38 + Math.min(28, Math.sqrt(nCount));

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const minSep = (nodeRadius(a) + nodeRadius(b)) * 1.15 + 10;
        if (dist < minSep * 6) {
          const f = ((repulse * repulse) / (dist * dist)) * 0.38 * state.alpha;
          const ma = massOf(a);
          const mb = massOf(b);
          dx = (dx / dist) * f;
          dy = (dy / dist) * f;
          a.vx += (dx * mb) / (ma + mb);
          a.vy += (dy * mb) / (ma + mb);
          b.vx -= (dx * ma) / (ma + mb);
          b.vy -= (dy * ma) / (ma + mb);
        }
      }
    }

    for (const l of links) {
      const dx = l.target.x - l.source.x;
      const dy = l.target.y - l.source.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const ideal = idealLinkLength(l);
      const f = ((dist - ideal) / dist) * 0.028 * state.alpha;
      l.source.vx += dx * f;
      l.source.vy += dy * f;
      l.target.vx -= dx * f;
      l.target.vy -= dy * f;
    }

    const pad = 40;
    for (const n of nodes) {
      const pull = n.kind === "case" ? 0.00055 : 0.0014;
      n.vx += (w / 2 - n.x) * pull * state.alpha;
      n.vy += (h / 2 - n.y) * pull * state.alpha;
      if (drag?.mode === "node" && drag.id === n.id) {
        n.x = drag.x;
        n.y = drag.y;
        n.vx = 0;
        n.vy = 0;
      } else {
        n.vx *= 0.84;
        n.vy *= 0.84;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(pad, Math.min(w - pad, n.x));
        n.y = Math.max(pad, Math.min(h - pad, n.y));
      }
    }
    return true;
  }

  function strokeColorForLink(hot, dim) {
    if (hot) return "rgba(125, 211, 192, 0.72)";
    if (dim) return "rgba(160, 176, 196, 0.05)";
    return "rgba(160, 176, 196, 0.22)";
  }

  function drawLinkLabel(ctx, l) {
    const mx = (l.source.x + l.target.x) / 2;
    const my = (l.source.y + l.target.y) / 2;
    ctx.fillStyle = "rgba(220, 230, 242, 0.85)";
    ctx.font = `${11 / camera.scale}px Sarabun, Anuphan, sans-serif`;
    ctx.fillText(l.label, mx, my);
  }

  function drawLinks(ctx, links, focus) {
    for (const l of links) {
      const hot = Boolean(focus) && (l.source.id === focus || l.target.id === focus);
      const dim = Boolean(focus) && !hot;
      ctx.strokeStyle = strokeColorForLink(hot, dim);
      ctx.lineWidth = (hot ? 2 : 0.9) / camera.scale;
      ctx.beginPath();
      ctx.moveTo(l.source.x, l.source.y);
      ctx.lineTo(l.target.x, l.target.y);
      ctx.stroke();
      if (hot && l.label && camera.scale > 0.7) drawLinkLabel(ctx, l);
    }
  }

  function drawNodes(ctx, nodes, neigh) {
    for (const n of nodes) {
      const r = nodeRadius(n);
      const selected = n.id === selectedId;
      const hovered = n.id === hoverId;
      const active = selected || hovered;
      const dim = neigh && !neigh.has(n.id);
      const color = KIND_COLOR[n.kind] || KIND_COLOR.other;

      ctx.globalAlpha = dim ? 0.18 : 1;

      // Soft Obsidian-like halo (stronger on case hubs)
      if (!dim && (n.kind === "case" || active)) {
        const glow = ctx.createRadialGradient(n.x, n.y, r * 0.2, n.x, n.y, r * (active ? 2.6 : 2.1));
        glow.addColorStop(0, color + "55");
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * (active ? 2.6 : 2.1), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, active ? r + 1.8 : r, 0, Math.PI * 2);
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
      ctx.globalAlpha = 1;
    }
  }

  function shouldShowLabel(n, neigh, showAll) {
    if (showAll) return true;
    if (n.id === selectedId || n.id === hoverId) return true;
    if (neigh?.has(n.id)) return n.kind === "case" || (n.degree || 0) >= 2;
    // When zoomed out, only key case hubs; when zoomed in, more case titles
    if (n.kind === "case") {
      if (camera.scale < 0.45) return (n.degree || 0) >= 8;
      if (camera.scale < 0.85) return (n.degree || 0) >= 4;
      return (n.degree || 0) >= 2;
    }
    if (n.kind === "crime_type") return camera.scale > 0.9 && (n.degree || 0) >= 6;
    return camera.scale > 1.35 && (n.degree || 0) >= 8;
  }

  function truncateLabel(title, kind) {
    const max = kind === "case" ? (camera.scale > 1.2 ? 42 : 28) : 22;
    if (title.length <= max) return title;
    return title.slice(0, max - 1) + "…";
  }

  function drawLabels(ctx, nodes, neigh) {
    const showAll = filters.showLabels === "all";
    if (filters.showLabels === "none") return;
    const fontPx = Math.max(10, Math.min(15, 12.5 / Math.sqrt(camera.scale)));
    ctx.font = `${fontPx / camera.scale}px Sarabun, Anuphan, sans-serif`;
    ctx.fillStyle = "rgba(236, 242, 248, 0.92)";
    const labeled = nodes.filter((n) => shouldShowLabel(n, neigh, showAll));
    // Prefer cases first so they win the label budget
    labeled.sort((a, b) => {
      const ka = a.kind === "case" ? 0 : a.kind === "crime_type" ? 1 : 2;
      const kb = b.kind === "case" ? 0 : b.kind === "crime_type" ? 1 : 2;
      if (ka !== kb) return ka - kb;
      return (b.degree || 0) - (a.degree || 0);
    });
    const cap = showAll ? 160 : camera.scale > 1 ? 70 : 40;
    for (const n of labeled.slice(0, cap)) {
      const outsideFocus = neigh && !neigh.has(n.id) && n.id !== selectedId && n.id !== hoverId;
      if (outsideFocus) continue;
      const label = truncateLabel(n.title, n.kind);
      ctx.fillText(label, n.x + nodeRadius(n) + 5, n.y + 3);
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

    drawLinks(ctx, links, focus);
    drawNodes(ctx, nodes, neigh);
    drawLabels(ctx, nodes, neigh);
    ctx.restore();
  }

  function loop() {
    if (!sim) return;
    const cont = tick(sim);
    draw(sim);
    if (!cont && pendingFit) {
      pendingFit = false;
      fitToView();
      draw(sim);
    }
    if (cont || drag) raf = requestAnimationFrame(loop);
    else raf = 0;
  }

  function bump() {
    if (sim) sim.alpha = Math.max(sim.alpha, 0.22);
    if (!raf) raf = requestAnimationFrame(loop);
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
    bump();
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
      bump();
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
                    `<li><button type="button" data-goto="${escapeHtml(e.target)}">${escapeHtml(e.label || "mentions")} → ${escapeHtml(nameOf(e.target))}</button></li>`
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
                    `<li><button type="button" data-goto="${escapeHtml(e.source)}">${escapeHtml(e.label || "mentions")} ← ${escapeHtml(nameOf(e.source))}</button></li>`
                )
                .join("")
            : "<li class='muted'>—</li>"
        }</ul></div>
      </div>
    `;
    bump();
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

  function renderHelp() {
    if (!els.help) return;
    els.help.innerHTML = `
      <h3>กราฟนี้คืออะไร?</h3>
      <p>สำเนากราฟจากคลัง Obsidian ตอน publish — โหนดใหญ่คือหัวข่าว (คดี)
      โหนดเล็กคือเอนทิตี/ประเภทที่คดีพูดถึง เส้นมีป้ายเช่น arrested_by / related_to</p>
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
      bump();
    });

    canvas.addEventListener("pointermove", (ev) => {
      const p = worldFromEvent(ev);
      if (!drag) {
        const hit = hitTest(p.x, p.y);
        const nid = hit?.id || null;
        if (nid !== hoverId) {
          hoverId = nid;
          canvas.style.cursor = hit ? "pointer" : "grab";
          bump();
        }
        return;
      }
      drag.moved =
        drag.moved ||
        Math.hypot(p.sx - (drag.startX || 0), p.sy - (drag.startY || 0)) > 4;
      if (drag.mode === "node") {
        drag.x = p.x;
        drag.y = p.y;
      } else {
        camera.x = drag.camX + (p.sx - drag.startX);
        camera.y = drag.camY + (p.sy - drag.startY);
      }
      bump();
    });

    const endDrag = () => {
      drag = null;
      bump();
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    canvas.addEventListener("dblclick", (ev) => {
      const p = worldFromEvent(ev);
      const hit = hitTest(p.x, p.y);
      if (!hit) {
        fitToView();
        bump();
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
      if (els.status) els.status.textContent = "กำลังโหลด Second Brain…";
      graph = await loadGraph();
      const n = graph.stats?.nodes || graph.nodes?.length || 0;
      if (!n) {
        if (els.empty) els.empty.hidden = false;
        if (els.status) els.status.textContent = "ยังไม่มีกราฟ";
        return;
      }
      if (els.empty) els.empty.hidden = true;
      if (els.status) {
        els.status.textContent = "กราฟแบบ Obsidian · โหนดใหญ่ = ข่าว · ซูม/พอดีจอได้";
      }
      renderHelp();
      fillEntityGroups();
      fillBureaus();
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
    ["brain-search", "brain-min-degree", "brain-date-from", "brain-date-to", "brain-entity-group", "brain-bureau", "brain-labels"].forEach(
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
      bump();
    });

    window.addEventListener("resize", () => {
      if ($("view-brain")?.hidden) return;
      restartSim(true, true);
    });
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
  };
})();
