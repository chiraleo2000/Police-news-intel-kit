/**
 * Static reader for github-pages/data/*.json
 * Route:
 *   #/ | #/r/{1|3|7|14|30|90|all}
 *   #/YYYY-MM-DD/<postId>
 *   #/downloads | #/downloads/r/{range}
 */
(() => {
  const F = window.NewsFormat;
  const DATA = "data";
  const RANGE_VALUES = new Set(["1", "3", "7", "14", "30", "90", "all"]);
  const RANGE_LABELS = {
    1: "วันนี้",
    3: "3 วัน",
    7: "7 วัน",
    14: "14 วัน",
    30: "30 วัน",
    90: "90 วัน",
    all: "ทั้งหมด",
  };
  const DEFAULT_RANGE = "7";

  const els = {
    tabNews: document.getElementById("tab-news"),
    tabDownloads: document.getElementById("tab-downloads"),
    viewNews: document.getElementById("view-news"),
    viewDownloads: document.getElementById("view-downloads"),
    rangeSelect: document.getElementById("range-select"),
    downloadRangeSelect: document.getElementById("download-range-select"),
    toolbar: document.getElementById("toolbar"),
    topicChips: document.getElementById("topic-chips"),
    tagFilter: document.getElementById("tag-filter"),
    searchInput: document.getElementById("search-input"),
    filterNote: document.getElementById("filter-note"),
    heroKicker: document.getElementById("hero-kicker"),
    heroTitle: document.getElementById("hero-title"),
    heroLead: document.getElementById("hero-lead"),
    heroMeta: document.getElementById("hero-meta"),
    statPosts: document.getElementById("stat-posts"),
    statTypes: document.getElementById("stat-types"),
    statAlerts: document.getElementById("stat-alerts"),
    kpi: document.getElementById("kpi"),
    alerts: document.getElementById("alerts"),
    alertsBody: document.getElementById("alerts-body"),
    insights: document.getElementById("insights"),
    byType: document.getElementById("by-type"),
    hotspots: document.getElementById("hotspots"),
    posts: document.getElementById("posts"),
    postList: document.getElementById("post-list"),
    postDetail: document.getElementById("post-detail"),
    downloadList: document.getElementById("download-list"),
    downloadEmpty: document.getElementById("download-empty"),
    status: document.getElementById("status"),
  };

  let manifest = { days: [] };
  let dayCache = new Map();
  let filters = { topic: "", tag: "", q: "" };
  let currentRange = DEFAULT_RANGE;
  let currentPosts = [];

  function bangkokToday() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  function addDaysIso(iso, delta) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
  }

  function daysInRange(range) {
    const all = manifest.days.slice();
    if (!all.length) return [];
    if (range === "all") return all;

    const n = Number(range) || 1;
    const today = bangkokToday();
    const latest = all[0].date;
    // anchor: วันนี้ถ้ามีในคลัง มิฉะนั้นวันล่าสุดที่มีไฟล์
    const anchor = all.some((d) => d.date === today) ? today : latest;
    const start = addDaysIso(anchor, -(n - 1));
    return all.filter((d) => d.date >= start && d.date <= anchor);
  }

  function parseHash() {
    const raw = (location.hash || "#/").replace(/^#\/?/, "");
    const parts = raw.split("/").filter(Boolean);

    if (parts[0] === "downloads") {
      if (parts[1] === "r" && RANGE_VALUES.has(parts[2])) {
        return { tab: "downloads", range: parts[2], date: null, postId: null };
      }
      return {
        tab: "downloads",
        range: currentRange,
        date: parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) ? parts[1] : null,
        postId: null,
      };
    }

    if (parts[0] === "r" && RANGE_VALUES.has(parts[1])) {
      return { tab: "news", range: parts[1], date: null, postId: null };
    }

    if (parts[0] && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
      return {
        tab: "news",
        range: currentRange,
        date: parts[0],
        postId: parts[1] ? decodeURIComponent(parts[1]) : null,
      };
    }

    return { tab: "news", range: currentRange || DEFAULT_RANGE, date: null, postId: null };
  }

  function setHash({ tab = "news", range = currentRange, date = null, postId = null } = {}) {
    if (tab === "downloads") {
      location.hash = `#/downloads/r/${range || DEFAULT_RANGE}`;
      return;
    }
    if (date && postId) {
      location.hash = `#/${date}/${encodeURIComponent(postId)}`;
      return;
    }
    location.hash = `#/r/${range || DEFAULT_RANGE}`;
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

  function mergePosts(primary, secondary) {
    const map = new Map();
    for (const p of [...(primary || []), ...(secondary || [])]) {
      if (!p) continue;
      const key = p.id || p.slug || p.source_url || p.title;
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, { ...p, corroborating_sources: [...(p.corroborating_sources || [])] });
        continue;
      }
      const cur = map.get(key);
      const extras = [];
      if (p.source_url && p.source_url !== cur.source_url) {
        extras.push({ name: p.agency || p.source_name || "แหล่งอื่น", url: p.source_url });
      }
      for (const s of p.corroborating_sources || []) {
        if (s && s.url) extras.push(s);
      }
      const seen = new Set(
        [cur.source_url, ...(cur.corroborating_sources || []).map((x) => x && x.url)].filter(Boolean)
      );
      for (const s of extras) {
        if (!s.url || seen.has(s.url)) continue;
        seen.add(s.url);
        cur.corroborating_sources.push(s);
      }
      if ((p.content || "").length > (cur.content || "").length) cur.content = p.content;
      if (!cur.tags) cur.tags = [];
      for (const t of p.tags || []) {
        if (!cur.tags.includes(t)) cur.tags.push(t);
      }
    }
    return [...map.values()];
  }

  async function loadDay(date) {
    if (dayCache.has(date)) return dayCache.get(date);

    const crimeMain =
      (await fetchJson(`${DATA}/${date}_crime.json`)) ||
      (await fetchJson(`${DATA}/${date}-crime.json`));
    const crimeLine = await fetchJson(`${DATA}/${date}_crime_line.json`);

    let crime = crimeMain;
    if (crimeMain && crimeLine) {
      const posts = mergePosts(crimeMain.posts, crimeLine.posts);
      crime = {
        ...crimeMain,
        posts,
        stats: {
          ...(crimeMain.stats || {}),
          total: posts.length,
          alerts:
            (crimeMain.stats && crimeMain.stats.alerts) ||
            posts.filter((p) => p.alert).length,
        },
      };
    } else if (!crimeMain && crimeLine) {
      crime = crimeLine;
    }

    const [hotspots, alerts] = await Promise.all([
      fetchJson(`${DATA}/${date}_hotspots.json`).then(
        (x) => x || fetchJson(`${DATA}/${date}_hotspots_line.json`)
      ),
      fetchJson(`${DATA}/${date}_alerts.json`).then(
        (x) => x || fetchJson(`${DATA}/${date}_alerts_line.json`)
      ),
    ]);

    const bundle = { date, crime, hotspots, alerts };
    dayCache.set(date, bundle);
    return bundle;
  }

  async function loadRange(range) {
    const days = daysInRange(range);
    const bundles = await Promise.all(days.map((d) => loadDay(d.date)));
    const posts = [];
    const hotspotMap = new Map();
    const alerts = [];
    let arrested = 0;
    let loss = 0;
    let seized = 0;
    let alertCount = 0;
    let hasArrested = false;
    let hasLoss = false;
    let hasSeized = false;

    for (const b of bundles) {
      if (!b.crime) continue;
      const dayPosts = Array.isArray(b.crime.posts) ? b.crime.posts : [];
      for (const p of dayPosts) {
        posts.push({ ...p, _date: b.date });
      }
      const st = b.crime.stats || {};
      if (st.total_arrested) {
        arrested += Number(st.total_arrested) || 0;
        hasArrested = true;
      }
      if (st.total_loss_thb) {
        loss += Number(st.total_loss_thb) || 0;
        hasLoss = true;
      }
      if (st.total_seized_value_thb) {
        seized += Number(st.total_seized_value_thb) || 0;
        hasSeized = true;
      }
      alertCount += Number(st.alerts ?? dayPosts.filter((p) => p.alert).length) || 0;

      for (const a of normalizeAlerts(b.alerts, dayPosts)) {
        alerts.push({ ...a, _date: b.date });
      }
      for (const h of normalizeHotspots(b.hotspots)) {
        const prev = hotspotMap.get(h.name) || 0;
        hotspotMap.set(h.name, prev + (h.count || 0));
      }
    }

    // cross-day event merge by id/slug/title+topic
    const merged = mergePosts(
      posts.map((p) => ({ ...p })),
      []
    ).map((p) => {
      const orig = posts.find((x) => (x.id && x.id === p.id) || (x.slug && x.slug === p.slug)) || p;
      return { ...p, _date: orig._date || p._date };
    });

    // Prefer keeping _date from newest occurrence
    const byKey = new Map();
    for (const p of posts) {
      const key = p.id || p.slug || p.source_url || p.title;
      if (!key) continue;
      if (!byKey.has(key) || (p._date || "") > (byKey.get(key)._date || "")) {
        byKey.set(key, p);
      }
    }
    const finalPosts = mergePosts(
      [...byKey.values()],
      []
    ).map((p) => {
      const key = p.id || p.slug || p.source_url || p.title;
      const src = byKey.get(key) || p;
      return { ...p, _date: src._date };
    });

    finalPosts.sort((a, b) => {
      const dd = (b._date || "").localeCompare(a._date || "");
      if (dd) return dd;
      return String(b.published_at || "").localeCompare(String(a.published_at || ""));
    });

    const hotspots = [...hotspotMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      range,
      days,
      posts: finalPosts,
      alerts,
      hotspots,
      stats: {
        total: finalPosts.length,
        total_arrested: hasArrested ? arrested : null,
        total_loss_thb: hasLoss ? loss : null,
        total_seized_value_thb: hasSeized ? seized : null,
        alerts: alertCount,
      },
    };
  }

  function setActiveTab(tab) {
    const isNews = tab !== "downloads";
    els.tabNews.classList.toggle("is-active", isNews);
    els.tabDownloads.classList.toggle("is-active", !isNews);
    els.viewNews.hidden = !isNews;
    els.viewDownloads.hidden = isNews;
  }

  function syncRangeSelects(range) {
    currentRange = range;
    if (els.rangeSelect) els.rangeSelect.value = range;
    if (els.downloadRangeSelect) els.downloadRangeSelect.value = range;
  }

  function hideAllDaySections() {
    for (const id of ["kpi", "alerts", "insights", "posts", "postDetail", "toolbar"]) {
      if (els[id]) els[id].hidden = true;
    }
  }

  function showEmpty() {
    hideAllDaySections();
    els.heroKicker.textContent = "รอไฟล์ JSON จากไปป์ไลน์";
    els.heroTitle.textContent = "ยังไม่มีสรุปข่าวในคลัง";
    els.heroLead.innerHTML =
      "เมื่อ task ส่งไฟล์เข้า <code>data/</code> หน้านี้จะแสดงข่าวที่รวมแหล่งซ้ำแล้ว กรองตามช่วงวัน ประเภท/แท็ก และลิงก์ต้นทาง";
    els.heroMeta.hidden = true;
    els.statPosts.textContent = "0 ข่าว";
    els.statTypes.textContent = "0 ประเภท";
    els.statAlerts.textContent = "0 เตือนภัย";
    els.status.textContent =
      "วางไฟล์ data/manifest.json และ data/{DATE}_crime.json แล้วรีเฟรชหน้า";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderBars(container, items, { labelKey = "name", valueKey = "count" } = {}) {
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
      row.innerHTML = `
        <span class="name">${escapeHtml(item[labelKey] || "")}</span>
        <span class="count">${F.number(val)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(val / max) * 100}%"></div></div>
      `;
      container.appendChild(row);
    }
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
    return (posts || []).filter((p) => p.alert);
  }

  function byCrimeTypeFromPosts(posts) {
    const tally = {};
    for (const p of posts) {
      const t = p.topic || p.category_label;
      if (!t) continue;
      tally[t] = (tally[t] || 0) + 1;
    }
    return Object.entries(tally)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  function sourceList(post) {
    const items = [];
    if (post.source_url) {
      items.push({
        name: post.source_name || post.agency || "แหล่งหลัก",
        url: post.source_url,
        primary: true,
      });
    }
    for (const s of post.corroborating_sources || []) {
      if (!s || !s.url) continue;
      if (items.some((x) => x.url === s.url)) continue;
      items.push({ name: s.name || s.title || "แหล่งยืนยัน", url: s.url, primary: false });
    }
    return items;
  }

  function applyFilters(posts) {
    const q = (filters.q || "").trim().toLowerCase();
    return posts.filter((p) => {
      const topic = p.topic || p.category_label || "";
      if (filters.topic && topic !== filters.topic) return false;
      if (filters.tag) {
        const tags = p.tags || [];
        if (!tags.includes(filters.tag)) return false;
      }
      if (!q) return true;
      const hay = [
        p.title,
        p.agency,
        topic,
        p._date,
        ...(p.tags || []),
        ...(p.province || []),
        p.content,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  function renderTopicChips(posts) {
    const topics = [...new Set(posts.map((p) => p.topic || p.category_label).filter(Boolean))].sort();
    els.topicChips.innerHTML =
      `<button type="button" class="chip-btn${filters.topic ? "" : " is-active"}" data-topic="">ทั้งหมด</button>` +
      topics
        .map(
          (t) =>
            `<button type="button" class="chip-btn${filters.topic === t ? " is-active" : ""}" data-topic="${escapeHtml(t)}">${escapeHtml(t)}</button>`
        )
        .join("");
  }

  function fillTagFilter(posts) {
    const tags = [...new Set(posts.flatMap((p) => p.tags || []).filter(Boolean))].sort();
    const current = filters.tag;
    els.tagFilter.innerHTML =
      `<option value="">ทุกแท็ก</option>` +
      tags.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    if (current && tags.includes(current)) els.tagFilter.value = current;
    else filters.tag = "";
  }

  function rangeCaption(feed) {
    const label = RANGE_LABELS[feed.range] || feed.range;
    if (!feed.days.length) return label;
    if (feed.days.length === 1) return `${label} · ${F.dateTh(feed.days[0].date)}`;
    const newest = feed.days[0].date;
    const oldest = feed.days[feed.days.length - 1].date;
    return `${label} · ${F.dateTh(oldest)} – ${F.dateTh(newest)} (${feed.days.length} วันที่มีข้อมูล)`;
  }

  function renderFeed(feed) {
    currentPosts = feed.posts || [];
    const posts = currentPosts;
    const stats = feed.stats || {};

    els.toolbar.hidden = false;
    els.postDetail.hidden = true;

    els.heroKicker.textContent = rangeCaption(feed);
    els.heroTitle.textContent = "ข่าวอาชญากรรมและการปฏิบัติหน้าที่ตำรวจ";
    els.heroLead.textContent =
      posts.length > 0
        ? `รวม ${F.number(stats.total ?? posts.length)} เหตุการณ์ใน${RANGE_LABELS[feed.range] || "ช่วงที่เลือก"} (รวมแหล่งซ้ำแล้ว)`
        : `ไม่มีข่าวในช่วง${RANGE_LABELS[feed.range] || "ที่เลือก"} — ลองขยายช่วงวันหรือรอไปป์ไลน์ส่งไฟล์`;
    els.heroMeta.hidden = false;
    els.heroMeta.textContent = manifest.generated_at
      ? `manifest อัปเดต ${manifest.generated_at}`
      : `${manifest.days.length} วันในคลัง`;

    const types = byCrimeTypeFromPosts(posts);
    els.statPosts.textContent = `${F.number(stats.total ?? posts.length)} ข่าว`;
    els.statTypes.textContent = `${F.number(types.length)} ประเภท`;
    els.statAlerts.textContent = `${F.number(stats.alerts ?? 0)} เตือนภัย`;

    const kpiItems = [
      { label: "จำนวนเหตุการณ์", value: F.number(stats.total ?? posts.length) },
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

    if (feed.alerts.length) {
      els.alerts.hidden = false;
      els.alertsBody.innerHTML = feed.alerts
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
          const when = a._date ? `<span class="muted"> · ${escapeHtml(F.dateTh(a._date))}</span>` : "";
          return `<div class="alert-item"><strong>${escapeHtml(title)}</strong>${when}${list}</div>`;
        })
        .join("");
    } else {
      els.alerts.hidden = true;
    }

    const spots = (feed.hotspots || []).slice(0, 5);
    if (types.length || spots.length) {
      els.insights.hidden = false;
      renderBars(els.byType, types);
      renderBars(els.hotspots, spots);
    } else {
      els.insights.hidden = true;
    }

    renderTopicChips(posts);
    fillTagFilter(posts);
    renderPostList(posts);
    els.status.textContent = `${posts.length} เหตุการณ์ · ${RANGE_LABELS[feed.range]} · รวมแหล่งซ้ำแล้ว`;
  }

  function renderPostList(posts) {
    els.posts.hidden = false;
    els.postDetail.hidden = true;

    const filtered = applyFilters(posts);
    els.filterNote.textContent =
      filtered.length === posts.length
        ? `แสดงทั้งหมด ${posts.length} รายการ`
        : `แสดง ${filtered.length} จาก ${posts.length} รายการ`;

    els.postList.innerHTML = filtered
      .map((p) => {
        const date = p._date || "";
        const sev = (p.severity || "").toLowerCase();
        const sources = sourceList(p);
        const chips = [
          date ? `<span class="chip">${escapeHtml(F.dateTh(date))}</span>` : "",
          p.topic || p.category_label
            ? `<span class="chip">${escapeHtml(p.topic || p.category_label)}</span>`
            : "",
          sev
            ? `<span class="chip sev-${escapeHtml(sev)}">${escapeHtml(F.severityLabel(sev))}</span>`
            : "",
          p.alert ? `<span class="chip alert">เตือนภัย</span>` : "",
          sources.length > 1 ? `<span class="chip ok">${sources.length} แหล่ง</span>` : "",
          p.verification === "official_confirmed"
            ? `<span class="chip ok">${escapeHtml(F.verificationLabel(p.verification))}</span>`
            : p.verification
              ? `<span class="chip">${escapeHtml(F.verificationLabel(p.verification))}</span>`
              : "",
        ]
          .filter(Boolean)
          .join("");

        const sourcePreview = sources
          .slice(0, 3)
          .map(
            (s) =>
              `<a class="source-chip" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${escapeHtml(s.name)}</a>`
          )
          .join("");

        const href = date
          ? `#/${date}/${encodeURIComponent(p.id || p.slug || "")}`
          : `#/r/${currentRange}`;

        return `<li>
          <a class="post-link" href="${href}">
            <h3 class="post-title">${escapeHtml(p.title || "(ไม่มีหัวข้อ)")}</h3>
            <div class="post-meta">${chips}</div>
            <p class="post-agency">${escapeHtml(p.agency || "")}</p>
            ${sourcePreview ? `<div class="source-row">${sourcePreview}</div>` : ""}
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
        <a class="back" href="#/r/${currentRange}">← กลับรายการ</a>
        <p>ไม่พบข่าวรหัส ${escapeHtml(postId)}</p>`;
      return;
    }

    els.posts.hidden = true;
    els.kpi.hidden = true;
    els.alerts.hidden = true;
    els.insights.hidden = true;
    els.postDetail.hidden = false;

    const actions = (post.actions_public || []).filter((a) => a && a !== "N/A");
    const tags = (post.tags || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");
    const sources = sourceList(post);
    const sourceHtml = sources.length
      ? `<div class="sources-block">
          <strong>แหล่งที่มา (${sources.length})</strong>
          <ul class="source-list">
            ${sources
              .map(
                (s) =>
                  `<li><a class="source-link" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)}${s.primary ? " · หลัก" : ""}</a></li>`
              )
              .join("")}
          </ul>
        </div>`
      : "";

    els.postDetail.innerHTML = `
      <a class="back" href="#/r/${currentRange}">← กลับรายการ (${escapeHtml(RANGE_LABELS[currentRange] || "")})</a>
      <div class="post-meta">
        ${date ? `<span class="chip">${escapeHtml(F.dateTh(date))}</span>` : ""}
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
      ${tags ? `<div class="post-meta" style="margin-top:0.75rem">${tags}</div>` : ""}
      ${sourceHtml}
    `;
  }

  function defaultDownloads(date) {
    return [
      { label: `PDF สรุปข่าว ${date}`, path: `downloads/${date}_crime.pdf`, kind: "pdf" },
      { label: `PDF จาก LINE ${date}`, path: `downloads/${date}_crime_line.pdf`, kind: "pdf" },
      { label: `Infographic ${date}`, path: `downloads/${date}_infographic.png`, kind: "image" },
      { label: `Infographic LINE ${date}`, path: `downloads/${date}_infographic_line.png`, kind: "image" },
      { label: `JSON ข่าว ${date}`, path: `${date}_crime.json`, kind: "json" },
    ];
  }

  async function fileExists(path) {
    try {
      let res = await fetch(path, { method: "HEAD", cache: "no-store" });
      if (res.ok) return true;
      if (res.status === 405 || res.status === 501) {
        res = await fetch(path, { method: "GET", cache: "no-store" });
        return res.ok;
      }
      return false;
    } catch {
      return false;
    }
  }

  function resolveDownloadHref(item) {
    if (item.path.startsWith("http")) return item.path;
    if (item.path.startsWith("data/")) return item.path;
    return `${DATA}/${item.path}`.replace(/\/{2,}/g, "/");
  }

  async function renderDownloads(range) {
    const days = daysInRange(range);
    const available = [];

    for (const day of days) {
      const date = day.date;
      const listed = Array.isArray(day.downloads) ? day.downloads : [];
      const candidates = listed.length
        ? listed.map((d) => ({
            label: d.label || d.name || d.path,
            path: d.path,
            kind: d.kind || "",
            date,
          }))
        : defaultDownloads(date).map((d) => ({ ...d, date }));

      for (const item of candidates) {
        const href = resolveDownloadHref(item);
        const ok = item.path.startsWith("http") ? true : await fileExists(href);
        if (ok) available.push({ ...item, href });
      }

      const jsonPath = `${DATA}/${date}_crime.json`;
      if ((await fileExists(jsonPath)) && !available.some((a) => a.href === jsonPath)) {
        available.push({ label: `JSON ข่าว ${date}`, href: jsonPath, kind: "json", date });
      }
      const jsonLine = `${DATA}/${date}_crime_line.json`;
      if ((await fileExists(jsonLine)) && !available.some((a) => a.href === jsonLine)) {
        available.push({ label: `JSON LINE ${date}`, href: jsonLine, kind: "json", date });
      }
    }

    els.downloadList.innerHTML = available
      .map((item) => {
        const ext = (item.kind || item.href.split(".").pop() || "").toUpperCase();
        const when = item.date ? F.dateTh(item.date) : "";
        return `<li class="download-item">
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            <p class="muted">${escapeHtml(when)} · ${escapeHtml(ext)}</p>
          </div>
          <a class="download-btn" href="${escapeHtml(item.href)}" download target="_blank" rel="noopener noreferrer">ดาวน์โหลด</a>
        </li>`;
      })
      .join("");

    els.downloadEmpty.hidden = available.length > 0;
    els.downloadEmpty.textContent = available.length
      ? ""
      : `ยังไม่มีไฟล์ดาวน์โหลดในช่วง${RANGE_LABELS[range] || ""} — วาง PDF/PNG ใน data/downloads/`;
    els.status.textContent = available.length
      ? `${available.length} ไฟล์ · ${RANGE_LABELS[range]}`
      : "ยังไม่มีไฟล์ดาวน์โหลด";
  }

  async function route() {
    const parsed = parseHash();
    const range = RANGE_VALUES.has(parsed.range) ? parsed.range : DEFAULT_RANGE;
    syncRangeSelects(range);
    setActiveTab(parsed.tab);

    if (!manifest.days.length) {
      if (parsed.tab === "downloads") {
        els.downloadList.innerHTML = "";
        els.downloadEmpty.hidden = false;
        els.status.textContent = "ยังไม่มีข้อมูลใน manifest";
        return;
      }
      showEmpty();
      return;
    }

    // normalize bare #/ → #/r/7
    if (parsed.tab === "news" && !parsed.date && !parsed.postId) {
      const raw = (location.hash || "").replace(/^#\/?/, "");
      if (!raw || raw === "/") {
        setHash({ tab: "news", range });
        return;
      }
    }

    if (parsed.tab === "downloads") {
      const raw = (location.hash || "").replace(/^#\/?/, "");
      if (raw === "downloads" || !raw.includes("/r/")) {
        setHash({ tab: "downloads", range });
        return;
      }
      await renderDownloads(range);
      return;
    }

    // post detail
    if (parsed.date && parsed.postId) {
      els.toolbar.hidden = false;
      els.status.textContent = "กำลังโหลด…";
      const feed = await loadRange(range);
      currentPosts = feed.posts;
      // ensure day posts available even if outside current range filter visually
      let posts = feed.posts.filter((p) => p._date === parsed.date);
      if (!posts.length) {
        const day = await loadDay(parsed.date);
        posts = ((day.crime && day.crime.posts) || []).map((p) => ({ ...p, _date: parsed.date }));
      }
      els.heroKicker.textContent = F.dateTh(parsed.date);
      els.heroTitle.textContent = "รายละเอียดข่าว";
      els.heroLead.textContent = "";
      els.heroMeta.hidden = true;
      renderPostDetail(parsed.date, posts, parsed.postId);
      els.status.textContent = "";
      return;
    }

    els.status.textContent = "กำลังโหลด…";
    const feed = await loadRange(range);
    renderFeed(feed);
  }

  function refreshListOnly() {
    renderPostList(currentPosts);
  }

  els.rangeSelect.addEventListener("change", () => {
    setHash({ tab: "news", range: els.rangeSelect.value });
  });

  els.downloadRangeSelect.addEventListener("change", () => {
    setHash({ tab: "downloads", range: els.downloadRangeSelect.value });
  });

  els.tabNews.addEventListener("click", () => {
    setHash({ tab: "news", range: currentRange });
  });

  els.tabDownloads.addEventListener("click", () => {
    setHash({ tab: "downloads", range: currentRange });
  });

  els.topicChips.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-topic]");
    if (!btn) return;
    filters.topic = btn.getAttribute("data-topic") || "";
    renderTopicChips(currentPosts);
    refreshListOnly();
  });

  els.tagFilter.addEventListener("change", () => {
    filters.tag = els.tagFilter.value;
    refreshListOnly();
  });

  let searchTimer;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      filters.q = els.searchInput.value;
      refreshListOnly();
    }, 180);
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
