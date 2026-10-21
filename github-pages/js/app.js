/**
 * Static reader for github-pages/data/*.json
 * Route: #/ | #/YYYY-MM-DD | #/YYYY-MM-DD/<postId>
 * Missing files → empty state (ไม่ error หน้าขาว)
 */
(() => {
  const F = window.NewsFormat;
  const DATA = "data";

  const els = {
    dateSelect: document.getElementById("date-select"),
    heroKicker: document.getElementById("hero-kicker"),
    heroTitle: document.getElementById("hero-title"),
    heroLead: document.getElementById("hero-lead"),
    heroMeta: document.getElementById("hero-meta"),
    kpi: document.getElementById("kpi"),
    alerts: document.getElementById("alerts"),
    alertsBody: document.getElementById("alerts-body"),
    insights: document.getElementById("insights"),
    byType: document.getElementById("by-type"),
    hotspots: document.getElementById("hotspots"),
    trends: document.getElementById("trends"),
    trendsNote: document.getElementById("trends-note"),
    trendsBody: document.getElementById("trends-body"),
    posts: document.getElementById("posts"),
    postList: document.getElementById("post-list"),
    topicFilter: document.getElementById("topic-filter"),
    postDetail: document.getElementById("post-detail"),
    status: document.getElementById("status"),
  };

  let manifest = { days: [] };
  let dayCache = new Map();

  function parseHash() {
    const raw = (location.hash || "#/").replace(/^#\/?/, "");
    const parts = raw.split("/").filter(Boolean);
    return {
      date: parts[0] && /^\d{4}-\d{2}-\d{2}$/.test(parts[0]) ? parts[0] : null,
      postId: parts[1] ? decodeURIComponent(parts[1]) : null,
    };
  }

  function setHash(date, postId) {
    if (!date) {
      location.hash = "#/";
      return;
    }
    location.hash = postId ? `#/${date}/${encodeURIComponent(postId)}` : `#/${date}`;
  }

  async function fetchJson(path) {
    try {
      const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function loadManifest() {
    const m = await fetchJson(`${DATA}/manifest.json`);
    if (!m) {
      manifest = { days: [] };
      return;
    }
    // รองรับทั้ง { days: [...] } และ array ตรง ๆ / entries
    const days = Array.isArray(m)
      ? m
      : Array.isArray(m.days)
        ? m.days
        : Array.isArray(m.entries)
          ? m.entries
          : [];
    manifest = {
      generated_at: m.generated_at || m.updated_at || "",
      days: days
        .map((d) => (typeof d === "string" ? { date: d } : d))
        .filter((d) => d && d.date)
        .sort((a, b) => b.date.localeCompare(a.date)),
    };
  }

  async function loadDay(date) {
    if (dayCache.has(date)) return dayCache.get(date);

    const crime =
      (await fetchJson(`${DATA}/${date}_crime.json`)) ||
      (await fetchJson(`${DATA}/${date}-crime.json`));

    const [hotspots, alerts, trends] = await Promise.all([
      fetchJson(`${DATA}/${date}_hotspots.json`).then((x) => x || fetchJson(`${DATA}/_hotspots.json`)),
      fetchJson(`${DATA}/${date}_alerts.json`).then((x) => x || fetchJson(`${DATA}/_alerts.json`)),
      fetchJson(`${DATA}/${date}_trends.json`).then((x) => x || fetchJson(`${DATA}/_trends.json`)),
    ]);

    const bundle = { date, crime, hotspots, alerts, trends };
    dayCache.set(date, bundle);
    return bundle;
  }

  function fillDateSelect(selected) {
    const sel = els.dateSelect;
    sel.innerHTML = "";
    if (!manifest.days.length) {
      sel.disabled = true;
      sel.innerHTML = `<option value="">ยังไม่มีข้อมูล</option>`;
      return;
    }
    sel.disabled = false;
    for (const d of manifest.days) {
      const opt = document.createElement("option");
      opt.value = d.date;
      opt.textContent = F.dateTh(d.date);
      if (d.date === selected) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function hideAllDaySections() {
    for (const id of ["kpi", "alerts", "insights", "trends", "posts", "postDetail"]) {
      els[id].hidden = true;
    }
  }

  function showEmpty() {
    hideAllDaySections();
    els.heroKicker.textContent = "รอไฟล์ JSON จากไปป์ไลน์";
    els.heroTitle.textContent = "ยังไม่มีสรุปข่าวในคลัง";
    els.heroLead.innerHTML =
      "เมื่อ server หรือ Claude task ส่งไฟล์เข้า <code>data/</code> หน้านี้จะแสดง KPI เตือนภัย และรายการข่าวอัตโนมัติ";
    els.heroMeta.hidden = true;
    els.status.textContent =
      "วางไฟล์ data/manifest.json และ data/{DATE}_crime.json แล้วรีเฟรชหน้า";
  }

  function renderBars(container, items, { labelKey = "name", valueKey = "count", surgeKey } = {}) {
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = `<p class="muted">ไม่มีข้อมูล</p>`;
      return;
    }
    const max = Math.max(...items.map((i) => Number(i[valueKey]) || 0), 1);
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "bar-row";
      const val = Number(item[valueKey]) || 0;
      const surge = surgeKey && item[surgeKey];
      row.innerHTML = `
        <span class="name">${escapeHtml(item[labelKey] || "")}</span>
        <span class="count">${F.number(val)}${surge ? ' <span class="delta up">▲</span>' : ""}</span>
        <div class="bar-track"><div class="bar-fill${surge ? " surge" : ""}" style="width:${(val / max) * 100}%"></div></div>
      `;
      container.appendChild(row);
    }
    // trigger transition
    requestAnimationFrame(() => {
      container.querySelectorAll(".bar-fill").forEach((el) => {
        const w = el.style.width;
        el.style.width = "0";
        requestAnimationFrame(() => {
          el.style.width = w;
        });
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeHotspots(raw) {
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : raw.hotspots || raw.items || [];
    return arr.map((h) => ({
      name: h.province || h.name || "ไม่ระบุ",
      count: h.count || 0,
    }));
  }

  function normalizeAlerts(raw, posts) {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.alerts)) return raw.alerts;
    if (raw && Array.isArray(raw.items)) return raw.items;
    // fallback จาก posts
    return (posts || []).filter((p) => p.alert);
  }

  function byCrimeTypeFromStats(stats) {
    const map = (stats && stats.by_crime_type) || {};
    return Object.entries(map)
      .map(([name, count]) => ({ name, count: typeof count === "object" ? count.count || 0 : count }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  function renderDay(bundle) {
    const { date, crime, hotspots, alerts, trends } = bundle;
    if (!crime) {
      hideAllDaySections();
      els.heroKicker.textContent = F.dateTh(date);
      els.heroTitle.textContent = "ยังไม่มีไฟล์ข่าวของวันนี้";
      els.heroLead.textContent = `ไม่พบ ${date}_crime.json ในโฟลเดอร์ data/`;
      els.heroMeta.hidden = true;
      els.status.textContent = "คัดลอกไฟล์จาก Document หรือ news-hub แล้วลองใหม่";
      return;
    }

    const stats = crime.stats || {};
    const posts = Array.isArray(crime.posts) ? crime.posts : [];

    els.heroKicker.textContent = `สรุปวันที่ ${F.dateTh(date)}`;
    els.heroTitle.textContent = "ข่าวอาชญากรรมและการปฏิบัติหน้าที่ตำรวจ";
    els.heroLead.textContent =
      posts.length > 0
        ? `รวม ${F.number(stats.total ?? posts.length)} ข่าวจากแหล่งสาธารณะ — จัดกลุ่มตามประเภทคดี`
        : "มีไฟล์สรุปแล้ว แต่ยังไม่มีรายการข่าวใน posts[]";
    els.heroMeta.hidden = false;
    els.heroMeta.textContent = crime.generated_at
      ? `สร้างเมื่อ ${crime.generated_at}`
      : "";

    // KPI — แสดง "—" ถ้าไม่มี ไม่ใส่ 0 หลอกสำหรับ loss/arrested
    const kpiItems = [
      { label: "จำนวนข่าว", value: F.number(stats.total ?? posts.length) },
      {
        label: "ผู้ต้องหาที่ถูกจับกุม",
        value: stats.total_arrested ? F.number(stats.total_arrested) : "—",
      },
      { label: "มูลค่าความเสียหาย", value: F.money(stats.total_loss_thb) },
      { label: "ยึด/อายัดทรัพย์", value: F.money(stats.total_seized_value_thb) },
      { label: "ข่าวเตือนภัย", value: F.number(stats.alerts ?? 0) },
    ];
    els.kpi.hidden = false;
    els.kpi.innerHTML = kpiItems
      .map(
        (k) =>
          `<div class="kpi-item"><span class="label">${k.label}</span><span class="value">${k.value}</span></div>`
      )
      .join("");

    // Alerts
    const alertItems = normalizeAlerts(alerts, posts);
    if (alertItems.length) {
      els.alerts.hidden = false;
      els.alertsBody.innerHTML = alertItems
        .slice(0, 8)
        .map((a) => {
          const title = a.title || a.topic || "เตือนภัย";
          const actions = a.actions_public || [];
          const list =
            actions.filter(Boolean).length > 0
              ? `<ul>${actions
                  .filter((x) => x && x !== "N/A")
                  .map((x) => `<li>${escapeHtml(x)}</li>`)
                  .join("")}</ul>`
              : a.content
                ? `<p>${escapeHtml(F.truncate(a.content, 160))}</p>`
                : "";
          return `<div class="alert-item"><strong>${escapeHtml(title)}</strong>${list}</div>`;
        })
        .join("");
    } else {
      els.alerts.hidden = true;
    }

    // Types + hotspots
    const types = byCrimeTypeFromStats(stats);
    const spots = normalizeHotspots(hotspots).slice(0, 5);
    if (types.length || spots.length) {
      els.insights.hidden = false;
      renderBars(els.byType, types);
      renderBars(els.hotspots, spots);
    } else {
      els.insights.hidden = true;
    }

    // Trends
    if (trends) {
      els.trends.hidden = false;
      const baseline = trends.baseline || "insufficient";
      els.trendsNote.textContent =
        baseline === "insufficient"
          ? "ข้อมูลย้อนหลังไม่พอ — ยังไม่อ้างแนวโน้ม"
          : `เทียบค่าเฉลี่ย ${trends.window_days || 7} วันก่อนหน้า`;
      const rows = (trends.by_crime_type || [])
        .filter((t) => t.today > 0 || t.surge)
        .map((t) => ({
          name: t.type || t.name || "",
          count: t.today || 0,
          surge: !!t.surge,
          delta: t.delta_pct,
        }));
      if (baseline === "insufficient" || !rows.length) {
        els.trendsBody.innerHTML = `<p class="muted">${
          baseline === "insufficient" ? "ซ่อนกราฟแนวโน้มจนกว่าจะมี baseline ≥ 3 วัน" : "ไม่มีประเภทที่ต้องแสดง"
        }</p>`;
      } else {
        renderBars(els.trendsBody, rows, { surgeKey: "surge" });
      }
    } else {
      els.trends.hidden = true;
    }

    // Posts list
    renderPostList(date, posts);
    els.status.textContent = `${posts.length} ข่าว · แหล่งสาธารณะ · ไม่ระบุผู้ส่งจาก LINE`;
  }

  function renderPostList(date, posts, topicFilter = "") {
    els.posts.hidden = false;
    els.postDetail.hidden = true;

    const topics = [...new Set(posts.map((p) => p.topic || p.category_label).filter(Boolean))].sort();
    const current = els.topicFilter.value;
    els.topicFilter.innerHTML =
      `<option value="">ทุกประเภท</option>` +
      topics.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    if (topicFilter || current) els.topicFilter.value = topicFilter || current;

    const filter = els.topicFilter.value;
    const filtered = filter
      ? posts.filter((p) => (p.topic || p.category_label) === filter)
      : posts;

    els.postList.innerHTML = filtered
      .map((p) => {
        const sev = (p.severity || "").toLowerCase();
        const chips = [
          p.topic || p.category_label
            ? `<span class="chip">${escapeHtml(p.topic || p.category_label)}</span>`
            : "",
          sev ? `<span class="chip sev-${escapeHtml(sev)}">${escapeHtml(F.severityLabel(sev))}</span>` : "",
          p.alert ? `<span class="chip alert">เตือนภัย</span>` : "",
          p.verification === "official_confirmed"
            ? `<span class="chip ok">${escapeHtml(F.verificationLabel(p.verification))}</span>`
            : p.verification
              ? `<span class="chip">${escapeHtml(F.verificationLabel(p.verification))}</span>`
              : "",
        ]
          .filter(Boolean)
          .join("");
        return `<li>
          <a class="post-link" href="#/${date}/${encodeURIComponent(p.id || p.slug || "")}">
            <h3 class="post-title">${escapeHtml(p.title || "(ไม่มีหัวข้อ)")}</h3>
            <div class="post-meta">${chips}</div>
            <p class="post-agency">${escapeHtml(p.agency || "")}</p>
          </a>
        </li>`;
      })
      .join("");

    if (!filtered.length) {
      els.postList.innerHTML = `<li><p class="muted">ไม่มีข่าวในตัวกรองนี้</p></li>`;
    }
  }

  function renderPostDetail(date, posts, postId) {
    const post = posts.find((p) => p.id === postId || p.slug === postId);
    if (!post) {
      els.postDetail.hidden = false;
      els.posts.hidden = true;
      els.postDetail.innerHTML = `
        <a class="back" href="#/${date}">← กลับรายการ</a>
        <p>ไม่พบข่าวรหัส ${escapeHtml(postId)}</p>`;
      return;
    }

    els.posts.hidden = true;
    els.postDetail.hidden = false;

    const actions = (post.actions_public || []).filter((a) => a && a !== "N/A");
    const tags = (post.tags || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");

    els.postDetail.innerHTML = `
      <a class="back" href="#/${date}">← กลับรายการวันที่ ${escapeHtml(F.dateTh(date))}</a>
      <div class="post-meta">
        ${post.topic || post.category_label ? `<span class="chip">${escapeHtml(post.topic || post.category_label)}</span>` : ""}
        ${post.severity ? `<span class="chip sev-${escapeHtml(String(post.severity).toLowerCase())}">${escapeHtml(F.severityLabel(post.severity))}</span>` : ""}
        ${post.alert ? `<span class="chip alert">เตือนภัย</span>` : ""}
        ${post.verification ? `<span class="chip">${escapeHtml(F.verificationLabel(post.verification))}</span>` : ""}
      </div>
      <h1>${escapeHtml(post.title || "")}</h1>
      <p class="muted">${escapeHtml(post.agency || "")}${post.published_at ? " · " + escapeHtml(post.published_at) : ""}</p>
      <div class="content">${escapeHtml(post.content || "")}</div>
      ${
        actions.length
          ? `<div class="actions"><strong>ข้อแนะนำประชาชน</strong><ul>${actions
              .map((a) => `<li>${escapeHtml(a)}</li>`)
              .join("")}</ul></div>`
          : ""
      }
      ${tags ? `<div class="post-meta">${tags}</div>` : ""}
      ${
        post.source_url
          ? `<p><a class="source-link" href="${escapeHtml(post.source_url)}" target="_blank" rel="noopener noreferrer">เปิดแหล่งข่าวต้นทาง</a></p>`
          : ""
      }
    `;
  }

  async function route() {
    const { date, postId } = parseHash();
    fillDateSelect(date || (manifest.days[0] && manifest.days[0].date) || "");

    if (!manifest.days.length && !date) {
      showEmpty();
      return;
    }

    const useDate = date || manifest.days[0].date;
    if (!date && useDate) {
      setHash(useDate);
      return;
    }

    if (els.dateSelect.value !== useDate) {
      els.dateSelect.value = useDate;
    }

    els.status.textContent = "กำลังโหลด…";
    const bundle = await loadDay(useDate);
    renderDay(bundle);

    if (postId && bundle.crime && Array.isArray(bundle.crime.posts)) {
      renderPostDetail(useDate, bundle.crime.posts, postId);
    }
  }

  els.dateSelect.addEventListener("change", () => {
    if (els.dateSelect.value) setHash(els.dateSelect.value);
  });

  els.topicFilter.addEventListener("change", async () => {
    const { date } = parseHash();
    if (!date) return;
    const bundle = await loadDay(date);
    if (bundle.crime) renderPostList(date, bundle.crime.posts || [], els.topicFilter.value);
  });

  window.addEventListener("hashchange", () => {
    route().catch((e) => {
      els.status.textContent = `โหลดไม่สำเร็จ: ${e.message || e}`;
    });
  });

  (async () => {
    await loadManifest();
    await route();
  })().catch((e) => {
    showEmpty();
    els.status.textContent = `โหลด manifest ไม่สำเร็จ: ${e.message || e}`;
  });
})();
