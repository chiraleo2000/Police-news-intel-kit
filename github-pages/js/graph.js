/**
 * Second Brain graph viewer — interactive force layout over data/graph.json
 * Zoom / pan / hover / isolate · multi filters · help copy (TH)
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
  const KIND_HELP = {
    case: "โน้ตคดีใน vault/20_Cases — หนึ่งเหตุการณ์ต่อหนึ่งโหนด",
    entity: "หน่วย / จังหวัด / กฎหมาย / MO ใน vault/30_Entities",
    crime_type: "หน้ารวมประเภทอาชญากรรมใน vault/40_CrimeTypes",
    daily: "สรุปรายวัน (ไม่ใช่ผลหลัก)",
    unresolved: "[[ลิงก์]] ที่ยังไม่มีโน้ตปลายทาง — ควรแก้ชื่อหรือสร้างโน้ต",
    other: "โน้ตอื่นในคลัง",
  };

  let graph = null;
  let sim = null;
  let raf = 0;
  let selectedId = null;
  let hoverId = null;
  let drag = null; // { mode:'node'|'pan', id?, x,y, startX,startY, moved }
  let camera = { x: 0, y: 0, scale: 1 };
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
    showLabels: "auto", // auto | all | none
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
    // cases/types are kept when filtering entity group — cases may link to them
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

  function initSim(nodes, edges) {
    const canvas = els.canvas;
    const w = Math.max(640, canvas.clientWidth || 960);
    const h = Math.max(480, canvas.clientHeight || 640);
    canvas.width = Math.floor(w * devicePixelRatio);
    canvas.height = Math.floor(h * devicePixelRatio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      if (n.x == null) n.x = w / 2 + (Math.random() - 0.5) * w * 0.55;
      if (n.y == null) n.y = h / 2 + (Math.random() - 0.5) * h * 0.55;
      n.vx = n.vx || 0;
      n.vy = n.vy || 0;
    }
    const links = edges
      .map((e) => ({ source: byId.get(e.source), target: byId.get(e.target), label: e.label }))
      .filter((l) => l.source && l.target);

    return { nodes, links, w, h, ctx, alpha: 1 };
  }

  function tick(state) {
    const { nodes, links, w, h } = state;
    if (state.alpha < 0.015 && !drag) return false;
    state.alpha *= 0.988;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const min = 42;
        if (dist < min * 5) {
          const f = ((min * min) / (dist * dist)) * 0.4 * state.alpha;
          dx = (dx / dist) * f;
          dy = (dy / dist) * f;
          a.vx += dx;
          a.vy += dy;
          b.vx -= dx;
          b.vy -= dy;
        }
      }
    }

    for (const l of links) {
      const dx = l.target.x - l.source.x;
      const dy = l.target.y - l.source.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const ideal = 110;
      const f = ((dist - ideal) / dist) * 0.022 * state.alpha;
      l.source.vx += dx * f;
      l.source.vy += dy * f;
      l.target.vx -= dx * f;
      l.target.vy -= dy * f;
    }

    for (const n of nodes) {
      n.vx += (w / 2 - n.x) * 0.0012 * state.alpha;
      n.vy += (h / 2 - n.y) * 0.0012 * state.alpha;
      if (drag?.mode === "node" && drag.id === n.id) {
        n.x = drag.x;
        n.y = drag.y;
        n.vx = 0;
        n.vy = 0;
      } else {
        n.vx *= 0.86;
        n.vy *= 0.86;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(24, Math.min(w - 24, n.x));
        n.y = Math.max(24, Math.min(h - 24, n.y));
      }
    }
    return true;
  }

  function nodeRadius(n) {
    let base = 6;
    if (n.kind === "crime_type") base = 9;
    else if (n.kind === "case") base = 8;
    return base + Math.min(6, Math.sqrt(n.degree || 0));
  }

  function strokeColorForLink(hot, dim) {
    if (hot) return "rgba(26,107,92,0.7)";
    if (dim) return "rgba(11,28,44,0.05)";
    return "rgba(11,28,44,0.16)";
  }

  function drawLinkLabel(ctx, l) {
    const mx = (l.source.x + l.target.x) / 2;
    const my = (l.source.y + l.target.y) / 2;
    ctx.fillStyle = "rgba(11,28,44,0.75)";
    ctx.font = `${11 / camera.scale}px Sarabun, Anuphan, sans-serif`;
    ctx.fillText(l.label, mx, my);
  }

  function drawLinks(ctx, links, focus) {
    for (const l of links) {
      const hot = Boolean(focus) && (l.source.id === focus || l.target.id === focus);
      const dim = Boolean(focus) && !hot;
      ctx.strokeStyle = strokeColorForLink(hot, dim);
      ctx.lineWidth = (hot ? 2.2 : 1) / camera.scale;
      ctx.beginPath();
      ctx.moveTo(l.source.x, l.source.y);
      ctx.lineTo(l.target.x, l.target.y);
      ctx.stroke();
      if (hot && l.label && camera.scale > 0.85) drawLinkLabel(ctx, l);
    }
  }

  function drawNodes(ctx, nodes, neigh) {
    for (const n of nodes) {
      const r = nodeRadius(n);
      const selected = n.id === selectedId;
      const hovered = n.id === hoverId;
      const active = selected || hovered;
      const dim = neigh && !neigh.has(n.id);
      ctx.beginPath();
      ctx.arc(n.x, n.y, active ? r + 2.5 : r, 0, Math.PI * 2);
      ctx.globalAlpha = dim ? 0.22 : 1;
      ctx.fillStyle = KIND_COLOR[n.kind] || KIND_COLOR.other;
      ctx.fill();
      if (active) {
        ctx.strokeStyle = "#0b1c2c";
        ctx.lineWidth = 2 / camera.scale;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function shouldShowLabel(n, neigh, showAll) {
    if (showAll) return true;
    if (n.id === selectedId || n.id === hoverId) return true;
    if (neigh?.has(n.id) && (n.degree || 0) >= 2) return true;
    return (n.degree || 0) >= 5;
  }

  function drawLabels(ctx, nodes, neigh) {
    const showAll = filters.showLabels === "all";
    if (filters.showLabels === "none") return;
    ctx.font = `${13 / camera.scale}px Sarabun, Anuphan, sans-serif`;
    ctx.fillStyle = "rgba(11,28,44,0.9)";
    const labeled = nodes.filter((n) => shouldShowLabel(n, neigh, showAll));
    const cap = showAll ? 120 : 50;
    for (const n of labeled.slice(0, cap)) {
      const outsideFocus = neigh && !neigh.has(n.id) && n.id !== selectedId && n.id !== hoverId;
      if (outsideFocus) continue;
      const label = n.title.length > 32 ? n.title.slice(0, 31) + "…" : n.title;
      ctx.fillText(label, n.x + nodeRadius(n) + 6, n.y + 4);
    }
  }

  function draw(state) {
    const { ctx, w, h, nodes, links } = state;
    ctx.clearRect(0, 0, w, h);
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
    if (cont || drag) raf = requestAnimationFrame(loop);
    else raf = 0;
  }

  function bump() {
    if (sim) sim.alpha = Math.max(sim.alpha, 0.25);
    if (!raf) raf = requestAnimationFrame(loop);
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

  function restartSim(preserveCam = true) {
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
    updateMeta(nodes, edges);
    raf = requestAnimationFrame(loop);
  }

  function hitTest(wx, wy) {
    if (!sim) return null;
    let best = null;
    let bestD = 16 / camera.scale;
    for (const n of sim.nodes) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      const thresh = nodeRadius(n) + 4 / camera.scale;
      if (d < Math.max(bestD, thresh) && d <= thresh + 2) {
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
          <p class="muted">จะแสดงคำอธิบายคดี/เอนทิตี ลิงก์เข้า–ออก และแท็กจาก Obsidian</p>
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
      if (n) {
        // center camera on node
        const r = els.canvas.getBoundingClientRect();
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
      <p>สำเนากราฟจากคลัง Obsidian ตอน publish — ไม่ได้ดึงสดจาก Obsidian
      เส้นมีป้ายความสัมพันธ์ เช่น arrested_by / related_to</p>
      <h3>วิธีใช้</h3>
      <ul>
        <li><strong>คลิก</strong> จุด = เปิดรายละเอียด</li>
        <li><strong>ลากจุด</strong> = จัดตำแหน่ง</li>
        <li><strong>ลากพื้นหลัง</strong> = เลื่อนมุมมอง (pan)</li>
        <li><strong>สกอร์ล</strong> = ซูมเข้า/ออก</li>
        <li><strong>ดับเบิลคลิก</strong> = โฟกัสเพื่อนบ้านของโหนด</li>
      </ul>
      <h3>สีโหนด</h3>
      <ul class="brain-help-colors">
        ${Object.keys(KIND_LABEL)
          .map(
            (k) =>
              `<li><i style="background:${KIND_COLOR[k]}"></i><span><strong>${KIND_LABEL[k]}</strong> — ${KIND_HELP[k]}</span></li>`
          )
          .join("")}
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
    restartSim(true);
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
    restartSim(false);
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
        const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
        const next = Math.min(3.5, Math.max(0.35, camera.scale * factor));
        camera.x = p.sx - p.x * next;
        camera.y = p.sy - p.y * next;
        camera.scale = next;
        updateMeta(sim?.nodes || [], sim?.links || []);
        bump();
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
        camera = { x: 0, y: 0, scale: 1 };
        bump();
        return;
      }
      filters.isolate = true;
      if ($("brain-isolate")) $("brain-isolate").checked = true;
      showDetail(hit);
      restartSim(true);
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
        els.status.textContent = "กราฟความรู้จาก Obsidian · ซูม/ลาก/กรองได้";
      }
      renderHelp();
      fillEntityGroups();
      fillBureaus();
      renderLegend();
      syncKindChecks();
      showDetail(null);
      restartSim(false);
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
      restartSim(true);
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
        // solo this kind
        filters.kinds = new Set([k]);
      } else {
        filters.kinds = new Set([k]);
      }
      syncKindChecks();
      showDetail(null);
      restartSim(true);
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
        restartSim(true);
        showDetail(selectedId ? graph.nodes.find((n) => n.id === selectedId) : null);
      }
      if (actionName === "center" && selectedId) selectById(selectedId);
    });

    $("brain-reset")?.addEventListener("click", resetAll);
    $("brain-zoom-in")?.addEventListener("click", () => {
      camera.scale = Math.min(3.5, camera.scale * 1.2);
      bump();
      updateMeta(sim?.nodes || [], sim?.links || []);
    });
    $("brain-zoom-out")?.addEventListener("click", () => {
      camera.scale = Math.max(0.35, camera.scale / 1.2);
      bump();
      updateMeta(sim?.nodes || [], sim?.links || []);
    });
    $("brain-zoom-fit")?.addEventListener("click", () => {
      camera = { x: 0, y: 0, scale: 1 };
      bump();
      updateMeta(sim?.nodes || [], sim?.links || []);
    });

    window.addEventListener("resize", () => {
      if ($("view-brain")?.hidden) return;
      restartSim(true);
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
        restartSim(true);
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
