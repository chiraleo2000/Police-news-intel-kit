/**
 * Second Brain graph viewer — force layout over data/graph.json
 * Obsidian-like: nodes = notes, edges = [[wikilinks]]
 */
(() => {
  const KIND_COLOR = {
    case: "#1a6b5c",
    entity: "#2c5f8a",
    crime_type: "#c45c26",
    daily: "#5a7184",
    unresolved: "#9b2c2c",
    other: "#3d5a6c",
  };
  const KIND_LABEL = {
    case: "คดี",
    entity: "เอนทิตี",
    crime_type: "ประเภทอาชญากรรม",
    daily: "รายวัน",
    unresolved: "ลิงก์ค้าง",
    other: "อื่น",
  };

  let graph = null;
  let sim = null;
  let raf = 0;
  let selectedId = null;
  let filterKind = "";
  let query = "";
  let drag = null;

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadGraph() {
    const res = await fetch(`data/graph.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("graph.json not found — run node ops/build-obsidian-graph.js");
    return res.json();
  }

  function visibleNodes() {
    if (!graph) return [];
    const q = query.trim().toLowerCase();
    return graph.nodes.filter((n) => {
      if (filterKind && n.kind !== filterKind) return false;
      if (!q) return true;
      const hay = `${n.title} ${n.id} ${(n.tags || []).join(" ")} ${n.crime_type || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function visibleSet(nodes) {
    return new Set(nodes.map((n) => n.id));
  }

  function visibleEdges(ids) {
    if (!graph) return [];
    return graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  }

  function initSim(nodes, edges) {
    const canvas = els.canvas;
    const w = canvas.clientWidth || 800;
    const h = canvas.clientHeight || 520;
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      if (n.x == null) n.x = w / 2 + (Math.random() - 0.5) * w * 0.5;
      if (n.y == null) n.y = h / 2 + (Math.random() - 0.5) * h * 0.5;
      n.vx = n.vx || 0;
      n.vy = n.vy || 0;
    }

    const linkForce = edges.map((e) => ({
      source: byId.get(e.source),
      target: byId.get(e.target),
    })).filter((l) => l.source && l.target);

    return { nodes, links: linkForce, w, h, ctx, alpha: 1 };
  }

  function tick(state) {
    const { nodes, links, w, h } = state;
    if (state.alpha < 0.02 && !drag) return false;
    state.alpha *= 0.985;

    // repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const min = 36;
        if (dist < min * 4) {
          const f = ((min * min) / (dist * dist)) * 0.35 * state.alpha;
          dx = (dx / dist) * f;
          dy = (dy / dist) * f;
          a.vx += dx;
          a.vy += dy;
          b.vx -= dx;
          b.vy -= dy;
        }
      }
    }

    // links
    for (const l of links) {
      const dx = l.target.x - l.source.x;
      const dy = l.target.y - l.source.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const ideal = 90;
      const f = ((dist - ideal) / dist) * 0.02 * state.alpha;
      const fx = dx * f;
      const fy = dy * f;
      l.source.vx += fx;
      l.source.vy += fy;
      l.target.vx -= fx;
      l.target.vy -= fy;
    }

    // center gravity
    for (const n of nodes) {
      n.vx += (w / 2 - n.x) * 0.0015 * state.alpha;
      n.vy += (h / 2 - n.y) * 0.0015 * state.alpha;
      if (drag && drag.id === n.id) {
        n.x = drag.x;
        n.y = drag.y;
        n.vx = 0;
        n.vy = 0;
      } else {
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(18, Math.min(w - 18, n.x));
        n.y = Math.max(18, Math.min(h - 18, n.y));
      }
    }
    return true;
  }

  function draw(state) {
    const { ctx, w, h, nodes, links } = state;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(11,28,44,0.18)";
    ctx.lineWidth = 1;
    for (const l of links) {
      const hot =
        selectedId && (l.source.id === selectedId || l.target.id === selectedId);
      ctx.strokeStyle = hot ? "rgba(26,107,92,0.55)" : "rgba(11,28,44,0.14)";
      ctx.lineWidth = hot ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(l.source.x, l.source.y);
      ctx.lineTo(l.target.x, l.target.y);
      ctx.stroke();
    }

    for (const n of nodes) {
      const r = n.kind === "case" ? 7 : n.kind === "crime_type" ? 8 : 5.5;
      const selected = n.id === selectedId;
      ctx.beginPath();
      ctx.arc(n.x, n.y, selected ? r + 2 : r, 0, Math.PI * 2);
      ctx.fillStyle = KIND_COLOR[n.kind] || KIND_COLOR.other;
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = "#0b1c2c";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // labels for selected + high-degree
    ctx.font = "12px Sarabun, Anuphan, sans-serif";
    ctx.fillStyle = "rgba(11,28,44,0.85)";
    const labeled = nodes
      .filter((n) => n.id === selectedId || (n.degree || 0) >= 4)
      .slice(0, 40);
    for (const n of labeled) {
      const label = n.title.length > 28 ? n.title.slice(0, 27) + "…" : n.title;
      ctx.fillText(label, n.x + 10, n.y + 4);
    }
  }

  function loop() {
    if (!sim) return;
    const cont = tick(sim);
    draw(sim);
    if (cont || drag) raf = requestAnimationFrame(loop);
    else raf = 0;
  }

  function restartSim() {
    if (raf) cancelAnimationFrame(raf);
    const nodes = visibleNodes();
    const ids = visibleSet(nodes);
    const edges = visibleEdges(ids);
    // preserve positions from previous nodes when possible
    if (sim) {
      const prev = new Map(sim.nodes.map((n) => [n.id, n]));
      for (const n of nodes) {
        const p = prev.get(n.id);
        if (p) {
          n.x = p.x;
          n.y = p.y;
        }
      }
    }
    sim = initSim(nodes, edges);
    els.meta.textContent = `${nodes.length} โน้ต · ${edges.length} ลิงก์`;
    raf = requestAnimationFrame(loop);
  }

  function hitTest(x, y) {
    if (!sim) return null;
    let best = null;
    let bestD = 14;
    for (const n of sim.nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  function showDetail(node) {
    selectedId = node ? node.id : null;
    if (!node) {
      els.detail.hidden = true;
      els.detail.innerHTML = "";
      if (sim && !raf) raf = requestAnimationFrame(loop);
      return;
    }
    const incoming = (graph.edges || []).filter((e) => e.target === node.id);
    const outgoing = (graph.edges || []).filter((e) => e.source === node.id);
    const nameOf = (id) => graph.nodes.find((n) => n.id === id)?.title || id;

    els.detail.hidden = false;
    els.detail.innerHTML = `
      <p class="brain-kind">${escapeHtml(KIND_LABEL[node.kind] || node.kind)}</p>
      <h3>${escapeHtml(node.title)}</h3>
      <p class="muted brain-path">${escapeHtml(node.path || node.id)}</p>
      ${node.date ? `<p class="muted">วันที่: ${escapeHtml(node.date)}</p>` : ""}
      ${node.crime_type ? `<p>ประเภท: <strong>${escapeHtml(node.crime_type)}</strong></p>` : ""}
      ${
        (node.tags || []).length
          ? `<p class="brain-tags">${node.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</p>`
          : ""
      }
      ${node.excerpt ? `<p class="brain-excerpt">${escapeHtml(node.excerpt)}</p>` : ""}
      <div class="brain-links">
        <div><strong>ออก (${outgoing.length})</strong><ul>${
          outgoing.length
            ? outgoing
                .slice(0, 12)
                .map(
                  (e) =>
                    `<li><button type="button" data-goto="${escapeHtml(e.target)}">${escapeHtml(nameOf(e.target))}</button></li>`
                )
                .join("")
            : "<li class='muted'>—</li>"
        }</ul></div>
        <div><strong>เข้า (${incoming.length})</strong><ul>${
          incoming.length
            ? incoming
                .slice(0, 12)
                .map(
                  (e) =>
                    `<li><button type="button" data-goto="${escapeHtml(e.source)}">${escapeHtml(nameOf(e.source))}</button></li>`
                )
                .join("")
            : "<li class='muted'>—</li>"
        }</ul></div>
      </div>
    `;
    if (sim && !raf) raf = requestAnimationFrame(loop);
  }

  function selectById(id) {
    const node = graph?.nodes.find((n) => n.id === id);
    if (!node) return;
    if (filterKind && node.kind !== filterKind) {
      filterKind = "";
      els.kindFilter.value = "";
    }
    showDetail(node);
    restartSim();
    if (sim) {
      const n = sim.nodes.find((x) => x.id === id);
      if (n) {
        n.x = sim.w / 2;
        n.y = sim.h / 2;
      }
    }
  }

  function renderLegend() {
    const counts = graph?.stats?.by_kind || {};
    els.legend.innerHTML = Object.keys(KIND_LABEL)
      .filter((k) => counts[k] || k === "unresolved")
      .map(
        (k) =>
          `<button type="button" class="brain-legend-item ${filterKind === k ? "is-active" : ""}" data-kind="${k}">
            <i style="background:${KIND_COLOR[k]}"></i>${KIND_LABEL[k]} <span>${counts[k] || 0}</span>
          </button>`
      )
      .join("");
  }

  function bindCanvas() {
    const canvas = els.canvas;
    const pos = (ev) => {
      const r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };

    canvas.addEventListener("pointerdown", (ev) => {
      const p = pos(ev);
      const hit = hitTest(p.x, p.y);
      if (hit) {
        drag = { id: hit.id, x: p.x, y: p.y };
        canvas.setPointerCapture(ev.pointerId);
        showDetail(hit);
        if (!raf) raf = requestAnimationFrame(loop);
      }
    });
    canvas.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      const p = pos(ev);
      drag.x = p.x;
      drag.y = p.y;
      if (sim) sim.alpha = Math.max(sim.alpha, 0.3);
      if (!raf) raf = requestAnimationFrame(loop);
    });
    canvas.addEventListener("pointerup", () => {
      drag = null;
    });
    canvas.addEventListener("pointerleave", () => {
      drag = null;
    });
  }

  async function mount() {
    els.canvas = $("brain-canvas");
    els.meta = $("brain-meta");
    els.detail = $("brain-detail");
    els.legend = $("brain-legend");
    els.kindFilter = $("brain-kind-filter");
    els.search = $("brain-search");
    els.status = $("brain-status");
    els.empty = $("brain-empty");
    if (!els.canvas) return;

    try {
      els.status.textContent = "กำลังโหลด Second Brain…";
      graph = await loadGraph();
      const n = graph.stats?.nodes || graph.nodes?.length || 0;
      if (!n) {
        els.empty.hidden = false;
        els.status.textContent = "ยังไม่มีกราฟ — รัน build-obsidian-graph.js หลังเขียน vault";
        return;
      }
      els.empty.hidden = true;
      els.status.textContent = `อัปเดต ${graph.generated_at || ""}`;
      renderLegend();
      restartSim();
      bindCanvas();
    } catch (e) {
      els.empty.hidden = false;
      els.status.textContent = e.message || String(e);
    }
  }

  function wireOnce() {
    if (els._wired) return;
    els._wired = true;
    $("brain-kind-filter")?.addEventListener("change", (e) => {
      filterKind = e.target.value;
      renderLegend();
      showDetail(null);
      restartSim();
    });
    let t;
    $("brain-search")?.addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => {
        query = e.target.value;
        restartSim();
      }, 140);
    });
    $("brain-legend")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-kind]");
      if (!btn) return;
      const k = btn.getAttribute("data-kind");
      filterKind = filterKind === k ? "" : k;
      if ($("brain-kind-filter")) $("brain-kind-filter").value = filterKind;
      renderLegend();
      showDetail(null);
      restartSim();
    });
    $("brain-detail")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-goto]");
      if (!btn) return;
      selectById(btn.getAttribute("data-goto"));
    });
    $("brain-reset")?.addEventListener("click", () => {
      filterKind = "";
      query = "";
      if ($("brain-kind-filter")) $("brain-kind-filter").value = "";
      if ($("brain-search")) $("brain-search").value = "";
      showDetail(null);
      if (sim) {
        for (const n of sim.nodes) {
          n.x = undefined;
          n.y = undefined;
        }
      }
      renderLegend();
      restartSim();
    });
    window.addEventListener("resize", () => {
      if ($("view-brain")?.hidden) return;
      restartSim();
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
        kindFilter: $("brain-kind-filter"),
        search: $("brain-search"),
        status: $("brain-status"),
        empty: $("brain-empty"),
      });
      if (!graph) await mount();
      else {
        renderLegend();
        restartSim();
      }
    },
    select(id) {
      selectById(id);
    },
    refresh() {
      graph = null;
      return mount();
    },
  };
})();
