/**
 * Police News Briefing — static reader
 * Primary: data/feed.json (all posts)
 * Fallback: data/manifest.json + {DATE}_crime.json
 * Routes: #/r/{1|3|7|14|30|90|all} · #/{DATE}/{postId} · #/brain · #/downloads/r/{range}
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
  const DEFAULT_RANGE = "all";
  const REFRESH_MS = 5 * 60 * 1000;

  const els = {
    tabNews: document.getElementById("tab-news"),
    tabBrain: document.getElementById("tab-brain"),
    tabDownloads: document.getElementById("tab-downloads"),
    viewNews: document.getElementById("view-news"),
    viewBrain: document.getElementById("view-brain"),
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
  let allPosts = [];
  let dayCache = new Map();
  let filters = { topic: "", tag: "", q: "" };
  let currentRange = DEFAULT_RANGE;
  let currentPosts = [];
  let bootstrapped = false;

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

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
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

  function normalizeDayEntry(d) {
    if (!d) return null;
    if (typeof d === "string") return { date: d };
    const date = d.date || d.day || d.id;
    if (!date) return null;
    return {
      ...d,
      date,
      crime_file: d.crime_file || d.path || d.file || `${date}_crime.json`,
      total: d.total ?? d.articles_total ?? d.count,
    };
  }

  function daysInRange(range) {
    const all = manifest.days.slice();
    if (!all.length) return [];
    if (range === "all") return all;
    const n = Number(range) || 1;
    const today = bangkokToday();
    const latest = all[0].date;
    const anchor = all.some((d) => d.date === today) ? today : latest;
    const start = addDaysIso(anchor, -(n - 1));
    return all.filter((d) => d.date >= start && d.date <= anchor);
  }

  function postsInRange(range) {
    const days = new Set(daysInRange(range).map((d) => d.date));
    if (!days.size) return [];
    return allPosts.filter((p) => days.has(p._date));
  }

  function parseHash() {
    const raw = (location.hash || "#/").replace(/^#\/?/, "");
    const parts = raw.split("/").filter(Boolean);

    if (parts[0] === "downloads") {
      const range =
        parts[1] === "r" && RANGE_VALUES.has(parts[2]) ? parts[2] : currentRange;
      return { tab: "downloads", range, date: null, postId: null, nodeId: null };
    }
    if (parts[0] === "brain") {
      return {
        tab: "brain",
        range: currentRange,
        date: null,
        postId: null,
        nodeId: parts[1] ? decodeURIComponent(parts[1]) : null,
      };
    }
    if (parts[0] === "r" && RANGE_VALUES.has(parts[1])) {
      return { tab: "news", range: parts[1], date: null, postId: null, nodeId: null };
    }
    if (parts[0] && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
      return {
        tab: "news",
        range: currentRange,
        date: parts[0],
        postId: parts[1] ? decodeURIComponent(parts[1]) : null,
        nodeId: null,
      };
    }
    return {
      tab: "news",
      range: currentRange || DEFAULT_RANGE,
      date: null,
      postId: null,
      nodeId: null,
    };
  }

  function setHash({
    tab = "news",
    range = currentRange,
    date = null,
    postId = null,
    nodeId = null,
  } = {}) {
    if (tab === "downloads") {
      location.hash = `#/downloads/r/${range || DEFAULT_RANGE}`;
      return;
    }
    if (tab === "brain") {
      location.hash = nodeId ? `#/brain/${encodeURIComponent(nodeId)}` : "#/brain";
      return;
    }
    if (date && postId) {
      location.hash = `#/${date}/${encodeURIComponent(postId)}`;
      return;
    }
    location.hash = `#/r/${range || DEFAULT_RANGE}`;
  }

  function mergeCorroborating(cur, p) {
    const extras = [];
    if (p.source_url && p.source_url !== cur.source_url) {
      extras.push({ name: p.agency || "แหล่งอื่น", url: p.source_url });
    }
    for (const s of p.corroborating_sources || []) if (s?.url) extras.push(s);
    const seen = new Set(
      [cur.source_url, ...(cur.corroborating_sources || []).map((x) => x?.url)].filter(Boolean)
    );
    for (const s of extras) {
      if (!s.url || seen.has(s.url)) continue;
      seen.add(s.url);
      cur.corroborating_sources.push(s);
    }
  }

  function mergeTags(cur, p) {
    for (const t of p.tags || []) if (!cur.tags.includes(t)) cur.tags.push(t);
  }

  function mergeContentAndDate(cur, p) {
    if ((p.content || "").length > (cur.content || "").length) cur.content = p.content;
    if ((p._date || "") > (cur._date || "")) cur._date = p._date;
  }

  function mergeInto(cur, p) {
    mergeCorroborating(cur, p);
    mergeTags(cur, p);
    mergeContentAndDate(cur, p);
  }

  function mergePosts(list) {
    const map = new Map();
    for (const p of list || []) {
      if (!p) continue;
      const key = p.id || p.slug || p.source_url || `${p._date}:${p.title}`;
      if (!key) continue;
      if (map.has(key)) {
        mergeInto(map.get(key), p);
      } else {
        map.set(key, {
          ...p,
          corroborating_sources: [...(p.corroborating_sources || [])],
          tags: [...(p.tags || [])],
        });
      }
    }
    return [...map.values()];
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
      if (!s?.url || items.some((x) => x.url === s.url)) continue;
      items.push({ name: s.name || "แหล่งยืนยัน", url: s.url, primary: false });
    }
    return items;
  }

  async function loadDayCrime(date, crimeFile) {
    if (dayCache.has(date)) return dayCache.get(date);
    const file = (crimeFile || `${date}_crime.json`).replace(/^.*\//, "");
    const crime =
      (await fetchJson(`${DATA}/${file}`)) ||
      (await fetchJson(`${DATA}/${date}_crime.json`)) ||
      (await fetchJson(`${DATA}/${date}_crime_line.json`));
    const line = await fetchJson(`${DATA}/${date}_crime_line.json`);
    let posts = [];
    if (crime?.posts && line?.posts) posts = mergePosts([...crime.posts, ...line.posts]);
    else if (crime?.posts) posts = crime.posts.slice();
    else if (line?.posts) posts = line.posts.slice();

    const hotspots =
      (await fetchJson(`${DATA}/${date}_hotspots.json`)) ||
      (await fetchJson(`${DATA}/${date}_hotspots_line.json`));
    const alerts =
      (await fetchJson(`${DATA}/${date}_alerts.json`)) ||
      (await fetchJson(`${DATA}/${date}_alerts_line.json`));

    const bundle = {
      date,
      posts: posts.map((p) => ({ ...p, _date: date })),
      stats: crime?.stats || line?.stats || {},
      hotspots,
      alerts,
    };
    dayCache.set(date, bundle);
    return bundle;
  }

  async function bootstrapData() {
    dayCache.clear();
    const [feed, man] = await Promise.all([
      fetchJson(`${DATA}/feed.json`),
      fetchJson(`${DATA}/manifest.json`),
    ]);

    const daysRaw = man?.days || man?.entries || feed?.days || [];
    manifest = {
      generated_at: man?.generated_at || feed?.generated_at || "",
      days: daysRaw
        .map(normalizeDayEntry)
        .filter(Boolean)
        .sort((a, b) => b.date.localeCompare(a.date)),
    };

    // Prefer feed.json posts (fast path)
    if (Array.isArray(feed?.posts) && feed.posts.length) {
      allPosts = mergePosts(
        feed.posts.map((p) => ({
          ...p,
          _date: p._date || p.date || p.published_date || inferDate(p),
        }))
      ).filter((p) => p._date);
    } else {
      // Fallback: load each day file listed in manifest
      const bundles = await Promise.all(
        manifest.days.map((d) => loadDayCrime(d.date, d.crime_file))
      );
      allPosts = mergePosts(bundles.flatMap((b) => b.posts || []));
    }

    // If feed exists but empty and days listed — still try day files
    if (!allPosts.length && manifest.days.length) {
      const bundles = await Promise.all(
        manifest.days.map((d) => loadDayCrime(d.date, d.crime_file))
      );
      allPosts = mergePosts(bundles.flatMap((b) => b.posts || []));
    }

    allPosts.sort((a, b) => {
      const dd = (b._date || "").localeCompare(a._date || "");
      return dd || String(b.published_at || "").localeCompare(String(a.published_at || ""));
    });

    // Ensure manifest days cover posts
    if (!manifest.days.length && allPosts.length) {
      const dates = [...new Set(allPosts.map((p) => p._date).filter(Boolean))].sort((a, b) => b.localeCompare(a));
      manifest.days = dates.map((date) => ({
        date,
        total: allPosts.filter((p) => p._date === date).length,
        crime_file: `${date}_crime.json`,
      }));
    }

    bootstrapped = true;
    return { posts: allPosts.length, days: manifest.days.length };
  }

  function inferDate(p) {
    const m = /(\d{4}-\d{2}-\d{2})/.exec(String(p.published_at || p.id || ""));
    return m ? m[1] : "";
  }

  function byCrimeType(posts) {
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

  function normalizeHotspots(raw) {
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : raw.hotspots || raw.items || [];
    return arr.map((h) => ({ name: h.province || h.name || "ไม่ระบุ", count: h.count || 0 }));
  }

  function applyFilters(posts) {
    const q = (filters.q || "").trim().toLowerCase();
    return posts.filter((p) => {
      const topic = p.topic || p.category_label || "";
      if (filters.topic && topic !== filters.topic) return false;
      if (filters.tag && !(p.tags || []).includes(filters.tag)) return false;
      if (!q) return true;
      const hay = [p.title, p.agency, topic, p._date, ...(p.tags || []), ...(p.province || []), p.content]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  function renderBars(container, items) {
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = `<p class="muted">ไม่มีข้อมูล</p>`;
      return;
    }
    const max = Math.max(...items.map((i) => Number(i.count) || 0), 1);
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "bar-row";
      const val = Number(item.count) || 0;
      row.innerHTML = `
        <span class="name">${escapeHtml(item.name || "")}</span>
        <span class="count">${F.number(val)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(val / max) * 100}%"></div></div>`;
      container.appendChild(row);
    }
  }

  function renderTopicChips(posts) {
    const topics = [...new Set(posts.map((p) => p.topic || p.category_label).filter(Boolean))].sort((a, b) => a.localeCompare(b));
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
    const tags = [...new Set(posts.flatMap((p) => p.tags || []).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const cur = filters.tag;
    els.tagFilter.innerHTML =
      `<option value="">ทุกแท็ก</option>` +
      tags.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    if (cur && tags.includes(cur)) els.tagFilter.value = cur;
    else filters.tag = "";
  }

  function rangeCaption(range, dayList) {
    const label = RANGE_LABELS[range] || range;
    if (!dayList.length) return label;
    if (dayList.length === 1) return `${label} · ${F.dateTh(dayList[0].date)}`;
    return `${label} · ${F.dateTh(dayList[dayList.length - 1].date)} – ${F.dateTh(dayList[0].date)}`;
  }

  function renderPostList(posts) {
    els.posts.hidden = false;
    els.postDetail.hidden = true;
    const filtered = applyFilters(posts);
    els.filterNote.textContent =
      filtered.length === posts.length
        ? `แสดง ${posts.length} รายการ`
        : `แสดง ${filtered.length} จาก ${posts.length} รายการ`;

    if (!filtered.length) {
      els.postList.innerHTML = `<li><p class="muted">ไม่มีข่าวในช่วง/ตัวกรองนี้ — ลองเลือก «ทั้งหมด»</p></li>`;
      return;
    }

    els.postList.innerHTML = filtered
      .map((p) => {
        const date = p._date || "";
        const sev = String(p.severity || "").toLowerCase();
        const sources = sourceList(p);
        const chips = [
          date ? `<span class="chip">${escapeHtml(F.dateTh(date))}</span>` : "",
          p.topic || p.category_label
            ? `<span class="chip">${escapeHtml(p.topic || p.category_label)}</span>`
            : "",
          sev ? `<span class="chip sev-${escapeHtml(sev)}">${escapeHtml(F.severityLabel(sev))}</span>` : "",
          p.alert ? `<span class="chip alert">เตือนภัย</span>` : "",
          sources.length > 1 ? `<span class="chip ok">${sources.length} แหล่ง</span>` : "",
          p.verification
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
  }

  const DAY_STAT_FIELDS = [
    ["total_arrested", "arrested", "hasA"],
    ["total_loss_thb", "loss", "hasL"],
    ["total_seized_value_thb", "seized", "hasS"],
  ];

  function addDayStats(totals, st) {
    for (const [field, sumKey, hasKey] of DAY_STAT_FIELDS) {
      if (!st[field]) continue;
      totals[sumKey] += Number(st[field]) || 0;
      totals[hasKey] = true;
    }
  }

  function dayAlertItems(bundle, posts, date) {
    if (Array.isArray(bundle.alerts)) return bundle.alerts;
    return (
      bundle.alerts?.alerts ||
      bundle.alerts?.items ||
      posts.filter((p) => p.alert && p._date === date)
    );
  }

  async function aggregateDayStats(dayList, posts) {
    const totals = {
      arrested: 0,
      loss: 0,
      seized: 0,
      hasA: false,
      hasL: false,
      hasS: false,
      hotspotMap: new Map(),
      alertItems: [],
    };
    const bundles = await Promise.all(dayList.map((d) => loadDayCrime(d.date, d.crime_file)));

    dayList.forEach((d, i) => {
      const b = bundles[i];
      addDayStats(totals, b.stats || {});
      for (const h of normalizeHotspots(b.hotspots)) {
        totals.hotspotMap.set(h.name, (totals.hotspotMap.get(h.name) || 0) + (h.count || 0));
      }
      for (const a of dayAlertItems(b, posts, d.date) || []) {
        totals.alertItems.push({ ...a, _date: d.date });
      }
    });
    return totals;
  }

  function renderAlertItems(alertItems) {
    if (!alertItems.length) {
      els.alerts.hidden = true;
      return;
    }
    els.alerts.hidden = false;
    els.alertsBody.innerHTML = alertItems
      .slice(0, 6)
      .map((a) => {
        const title = a.title || a.topic || "เตือนภัย";
        const actions = (a.actions_public || []).filter((x) => x && x !== "N/A");
        const listItems = actions.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
        const list = actions.length ? `<ul>${listItems}</ul>` : "";
        return `<div class="alert-item"><strong>${escapeHtml(title)}</strong>${list}</div>`;
      })
      .join("");
  }

  async function renderFeed(range) {
    const dayList = daysInRange(range);
    currentPosts = postsInRange(range);
    const posts = currentPosts;
    const types = byCrimeType(posts);
    const alertCount = posts.filter((p) => p.alert).length;

    els.heroKicker.textContent = rangeCaption(range, dayList);
    els.heroTitle.textContent = "ข่าวอาชญากรรมและการปฏิบัติหน้าที่ตำรวจ";
    els.heroLead.textContent = posts.length
      ? `รวม ${F.number(posts.length)} เหตุการณ์ · กรองประเภท/แท็กได้ · มีลิงก์แหล่งที่มา`
      : "ยังไม่มีข่าวในช่วงนี้ — เลือก «ทั้งหมด» หรือรอไปป์ไลน์อัปเดต JSON";
    els.heroMeta.hidden = false;
    els.heroMeta.textContent = manifest.generated_at
      ? `อัปเดตล่าสุด ${manifest.generated_at}`
      : `${manifest.days.length} วันในคลัง`;

    els.statPosts.textContent = `${F.number(posts.length)} ข่าว`;
    els.statTypes.textContent = `${F.number(types.length)} ประเภท`;
    els.statAlerts.textContent = `${F.number(alertCount)} เตือนภัย`;

    renderTopicChips(posts);
    fillTagFilter(posts);
    renderPostList(posts);

    // KPI below posts
    const { arrested, loss, seized, hasA, hasL, hasS, hotspotMap, alertItems } =
      await aggregateDayStats(dayList, posts);

    els.kpi.hidden = false;
    els.kpi.innerHTML = [
      { label: "จำนวนเหตุการณ์", value: F.number(posts.length) },
      { label: "ผู้ต้องหาที่ถูกจับกุม", value: hasA ? F.number(arrested) : "—" },
      { label: "มูลค่าความเสียหาย", value: F.money(hasL ? loss : null) },
      { label: "ยึด/อายัดทรัพย์", value: F.money(hasS ? seized : null) },
      { label: "ข่าวเตือนภัย", value: F.number(alertCount) },
    ]
      .map(
        (k) =>
          `<div class="kpi-item"><span class="label">${k.label}</span><span class="value">${k.value}</span></div>`
      )
      .join("");

    renderAlertItems(alertItems);

    const spots = [...hotspotMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    if (types.length || spots.length) {
      els.insights.hidden = false;
      renderBars(els.byType, types);
      renderBars(els.hotspots, spots);
    } else {
      els.insights.hidden = true;
    }

    els.status.textContent = `${posts.length} เหตุการณ์ · ${RANGE_LABELS[range]} · พร้อมใช้งาน`;
  }

  const REL_TH = {
    investigated_by: "สืบสวนโดย",
    arrested_by: "จับโดย",
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

  function relationLabel(raw) {
    if (window.BrainGraph?.relationLabel) return window.BrainGraph.relationLabel(raw);
    const s = String(raw ?? "").trim();
    if (!s) return "";
    if (REL_TH[s]) return REL_TH[s];
    const key = s.toLowerCase().replace(/\s+/g, "_");
    if (REL_TH[key]) return REL_TH[key];
    return s;
  }

  async function storyGraphSection(post) {
    if (window.BrainGraph?.storyGraphHtml) {
      try {
        return await window.BrainGraph.storyGraphHtml(post);
      } catch {
        /* fall through */
      }
    }
    const caseKey = post.id || post.slug || "";
    const svgPath = caseKey ? `data/graphs/${encodeURIComponent(caseKey)}.svg` : "";
    const related = post.related_cases || [];
    const relHtml = related.length
      ? `<ul class="story-rel-list">${related
          .map(
            (r) =>
              `<li><span class="story-rel-label">${escapeHtml(relationLabel(r.relation || "related_to"))}</span> → ${escapeHtml(r.title || r.id)}</li>`
          )
          .join("")}</ul>`
      : `<p class="muted">ยังไม่มีเส้นความสัมพันธ์</p>`;
    return `
      <section class="analysis-block story-graph-block">
        <h2>ข้อมูลกราฟของข่าวนี้</h2>
        <p class="story-graph-actions"><a class="btn-ghost story-open-graph" href="#/brain">เปิดในกราฟ</a></p>
        ${
          svgPath
            ? `<img class="story-ego-img" src="${svgPath}" alt="ข้อมูลกราฟ" loading="lazy" onerror="this.hidden=true" />`
            : ""
        }
        <h3 class="story-rel-heading">ความสัมพันธ์</h3>
        ${relHtml}
        <p class="muted story-graph-link"><a href="#/brain">เปิดแท็บข้อมูลกราฟ</a></p>
      </section>`;
  }

  async function renderPostDetail(date, postId) {
    const post =
      allPosts.find((p) => p._date === date && (p.id === postId || p.slug === postId)) ||
      allPosts.find((p) => p.id === postId || p.slug === postId);

    els.posts.hidden = true;
    els.kpi.hidden = true;
    els.alerts.hidden = true;
    els.insights.hidden = true;
    els.postDetail.hidden = false;

    if (!post) {
      els.postDetail.innerHTML = `
        <a class="back" href="#/r/${currentRange}">← กลับรายการ</a>
        <p>ไม่พบข่าวรหัส ${escapeHtml(postId)}</p>`;
      return;
    }

    const actions = (post.actions_public || []).filter((a) => a && a !== "N/A");
    const tags = (post.tags || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");
    const sources = sourceList(post);
    const graphHtml = await storyGraphSection(post);
    els.postDetail.innerHTML = `
      <a class="back" href="#/r/${currentRange}">← กลับรายการ (${escapeHtml(RANGE_LABELS[currentRange])})</a>
      <div class="post-meta">
        ${date ? `<span class="chip">${escapeHtml(F.dateTh(date))}</span>` : ""}
        ${post.topic || post.category_label ? `<span class="chip">${escapeHtml(post.topic || post.category_label)}</span>` : ""}
        ${post.severity ? `<span class="chip sev-${escapeHtml(String(post.severity).toLowerCase())}">${escapeHtml(F.severityLabel(post.severity))}</span>` : ""}
        ${post.alert ? `<span class="chip alert">เตือนภัย</span>` : ""}
      </div>
      <h1>${escapeHtml(post.title || "")}</h1>
      <p class="muted">${escapeHtml(post.agency || "")}${post.published_at ? " · " + escapeHtml(post.published_at) : ""}</p>
      <div class="content">${escapeHtml(post.content || "")}</div>
      ${
        post.exec_blurb
          ? `<section class="analysis-block"><h2>สำหรับผู้บริหาร</h2><p>${escapeHtml(post.exec_blurb)}</p></section>`
          : ""
      }
      ${
        post.analysis_notes
          ? `<section class="analysis-block"><h2>วิเคราะห์</h2><p class="pre">${escapeHtml(post.analysis_notes)}</p></section>`
          : ""
      }
      ${graphHtml}
      ${
        (post.related_cases || []).length
          ? `<section class="analysis-block"><h2>ความเชื่อมโยง (related_cases)</h2><ul>${post.related_cases
              .map(
                (r) =>
                  `<li><a href="#/${escapeHtml(post._date || date)}/${encodeURIComponent(r.id)}">${escapeHtml(r.title || r.id)}</a> <span class="muted">(${escapeHtml(relationLabel(r.relation || "related_to"))})</span></li>`
              )
              .join("")}</ul></section>`
          : `<section class="analysis-block"><h2>ความเชื่อมโยง (related_cases)</h2><p class="muted">ยังไม่พบเรื่องที่เกี่ยวข้องในช่วงที่ค้นได้</p></section>`
      }
      <section class="fact-card">
        <h2>การ์ดข้อเท็จจริง</h2>
        <dl>
          <div><dt>ประเภทคดี</dt><dd>${escapeHtml(post.topic || "-")}</dd></div>
          <div><dt>พื้นที่</dt><dd>${escapeHtml(post.area || (post.province || []).join(", ") || "-")}</dd></div>
          <div><dt>สถานะ</dt><dd>${escapeHtml(post.status_th || post.case_stage || "-")}</dd></div>
          <div><dt>มูลค่าความเสียหาย</dt><dd>${escapeHtml(post.stats?.loss_thb ? F.money(post.stats.loss_thb) : "-")}</dd></div>
          <div><dt>ชื่อกลุ่ม/แก๊ง</dt><dd>${escapeHtml(post.gang_or_group || "-")}</dd></div>
          <div><dt>หน่วยงานหลัก</dt><dd>${escapeHtml(post.primary_bureau || "-")}</dd></div>
        </dl>
      </section>
      ${
        actions.length
          ? `<div class="actions"><strong>ข้อแนะนำประชาชน</strong><ul>${actions
              .map((a) => `<li>${escapeHtml(a)}</li>`)
              .join("")}</ul></div>`
          : ""
      }
      ${tags ? `<div class="post-meta" style="margin-top:0.75rem">${tags}</div>` : ""}
      ${
        sources.length
          ? `<div class="sources-block"><strong>แหล่งที่มา (${sources.length})</strong><ul class="source-list">${sources
              .map(
                (s) =>
                  `<li><a class="source-link" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)}${s.primary ? " · หลัก" : ""}</a></li>`
              )
              .join("")}</ul></div>`
          : ""
      }
    `;
    els.status.textContent = post.title || "";
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

  function downloadKindRank(kind) {
    if (kind === "pdf") return 0;
    if (kind === "image") return 1;
    return 2;
  }

  function downloadKindLabel(kind) {
    if (kind === "pdf") return "PDF สรุปรายวัน";
    if (kind === "image") return "Infographic";
    return (kind || "").toUpperCase();
  }

  function downloadCandidatesForDay(day) {
    const date = day.date;
    // PDF สรุปรายวันเป็นหลัก — ไม่ใส่ JSON ในแท็บนี้
    const defaults = [
      {
        label: `PDF สรุปข่าว ${date}`,
        path: `downloads/${date}_crime.pdf`,
        kind: "pdf",
        date,
      },
      {
        label: `PDF จาก LINE ${date}`,
        path: `downloads/${date}_crime_line.pdf`,
        kind: "pdf",
        date,
      },
      {
        label: `Infographic ${date}`,
        path: `downloads/${date}_infographic.png`,
        kind: "image",
        date,
      },
      {
        label: `Infographic LINE ${date}`,
        path: `downloads/${date}_infographic_line.png`,
        kind: "image",
        date,
      },
    ];
    const listed = Array.isArray(day.downloads)
      ? day.downloads
          .filter((d) => d && d.kind !== "json" && !String(d.path || "").endsWith(".json"))
          .map((d) => ({ ...d, date }))
      : [];
    // merge: listed first, then defaults missing from listed
    const seen = new Set(listed.map((d) => d.path));
    for (const d of defaults) {
      if (!seen.has(d.path)) listed.push(d);
    }
    // PDF before images
    listed.sort(
      (a, b) =>
        downloadKindRank(a.kind) - downloadKindRank(b.kind) ||
        String(b.date).localeCompare(String(a.date))
    );
    return listed;
  }

  async function renderDownloads(range) {
    const days = daysInRange(range);
    const candidates = days.flatMap((day) =>
      downloadCandidatesForDay(day).map((item) => ({
        ...item,
        href: item.path.startsWith("http")
          ? item.path
          : `${DATA}/${item.path}`.replace(/\/{2,}/g, "/"),
      }))
    );
    const exists = await Promise.all(
      candidates.map((item) => item.path.startsWith("http") || fileExists(item.href))
    );
    const available = candidates.filter((_, i) => exists[i]);
    els.downloadList.innerHTML = available
      .map((item) => {
        const kindLabel = downloadKindLabel(item.kind);
        return `<li class="download-item">
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            <p class="muted">${escapeHtml(item.date ? F.dateTh(item.date) : "")} · ${escapeHtml(kindLabel)}</p>
          </div>
          <a class="download-btn" href="${escapeHtml(item.href)}" download target="_blank" rel="noopener noreferrer">ดาวน์โหลด</a>
        </li>`;
      })
      .join("");
    els.downloadEmpty.hidden = available.length > 0;
    els.downloadEmpty.textContent = available.length
      ? ""
      : `ยังไม่มี PDF สรุปในช่วง${RANGE_LABELS[range]} — รันไปป์ไลน์แล้ว copy ไป data/downloads/{DATE}_crime.pdf`;
    els.status.textContent = available.length
      ? `${available.length} ไฟล์ (PDF/Infographic) · ${RANGE_LABELS[range]}`
      : "ยังไม่มี PDF ให้ดาวน์โหลด";
  }

  function setActiveTab(tab) {
    const isNews = tab === "news";
    const isBrain = tab === "brain";
    const isDownloads = tab === "downloads";
    els.tabNews.classList.toggle("is-active", isNews);
    els.tabBrain?.classList.toggle("is-active", isBrain);
    els.tabDownloads.classList.toggle("is-active", isDownloads);
    els.viewNews.hidden = !isNews;
    if (els.viewBrain) els.viewBrain.hidden = !isBrain;
    els.viewDownloads.hidden = !isDownloads;
    document.body.classList.toggle("is-brain", isBrain);
    const main = document.getElementById("main");
    if (main) main.classList.toggle("main-brain", isBrain);
  }

  function syncRange(range) {
    currentRange = range;
    els.rangeSelect.value = range;
    els.downloadRangeSelect.value = range;
  }

  function redirectToCanonicalHash(parsed, range) {
    const raw = (location.hash || "").replace(/^#\/?/, "");
    if (parsed.tab === "news" && !parsed.date && !parsed.postId && (!raw || raw === "/")) {
      setHash({ tab: "news", range });
      return true;
    }
    if (parsed.tab === "downloads" && !raw.includes("/r/")) {
      setHash({ tab: "downloads", range });
      return true;
    }
    if (parsed.tab === "brain" && raw !== "brain" && !raw.startsWith("brain/")) {
      setHash({ tab: "brain", nodeId: parsed.nodeId });
      return true;
    }
    return false;
  }

  async function handleBrainRoute(parsed) {
    if (window.BrainGraph) {
      await window.BrainGraph.show();
      if (parsed.nodeId) window.BrainGraph.select(parsed.nodeId);
    }
    els.status.textContent = "ข้อมูลกราฟ · จาก vault Obsidian";
  }

  function handleEmpty() {
    els.heroKicker.textContent = "รอไฟล์ JSON";
    els.heroTitle.textContent = "ยังไม่มีสรุปข่าวในคลัง";
    els.heroLead.textContent = "วาง feed.json หรือ manifest.json + *_crime.json ใต้ data/";
    els.postList.innerHTML = `<li><p class="muted">ยังไม่มีข้อมูล</p></li>`;
    els.statPosts.textContent = "0 ข่าว";
    els.statTypes.textContent = "0 ประเภท";
    els.statAlerts.textContent = "0 เตือนภัย";
    els.status.textContent = "ไม่มีข้อมูลในคลัง";
  }

  async function route() {
    if (!bootstrapped) return;
    const parsed = parseHash();
    const range = RANGE_VALUES.has(parsed.range) ? parsed.range : DEFAULT_RANGE;
    syncRange(range);
    setActiveTab(parsed.tab);

    if (redirectToCanonicalHash(parsed, range)) return;

    if (parsed.tab === "brain") {
      await handleBrainRoute(parsed);
      return;
    }

    if (!allPosts.length && !manifest.days.length) {
      handleEmpty();
      return;
    }

    if (parsed.tab === "downloads") {
      await renderDownloads(range);
      return;
    }

    if (parsed.date && parsed.postId) {
      await renderPostDetail(parsed.date, parsed.postId);
      return;
    }

    await renderFeed(range);
  }

  els.rangeSelect.addEventListener("change", () => {
    setHash({ tab: "news", range: els.rangeSelect.value });
  });
  els.downloadRangeSelect.addEventListener("change", () => {
    setHash({ tab: "downloads", range: els.downloadRangeSelect.value });
  });
  els.tabNews.addEventListener("click", () => setHash({ tab: "news", range: currentRange }));
  els.tabBrain?.addEventListener("click", () => setHash({ tab: "brain" }));
  els.tabDownloads.addEventListener("click", () =>
    setHash({ tab: "downloads", range: currentRange })
  );
  els.topicChips.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-topic]");
    if (!btn) return;
    filters.topic = btn.dataset.topic || "";
    renderTopicChips(currentPosts);
    renderPostList(currentPosts);
  });
  els.tagFilter.addEventListener("change", () => {
    filters.tag = els.tagFilter.value;
    renderPostList(currentPosts);
  });
  let searchTimer;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      filters.q = els.searchInput.value;
      renderPostList(currentPosts);
    }, 160);
  });

  window.addEventListener("hashchange", () => {
    route().catch((e) => {
      els.status.textContent = `โหลดไม่สำเร็จ: ${e.message || e}`;
    });
  });

  async function boot() {
    els.status.textContent = "กำลังโหลดคลังข่าว…";
    const info = await bootstrapData();
    els.status.textContent = `โหลดแล้ว ${info.posts} ข่าว / ${info.days} วัน`;
    await route();
  }

  boot().catch((e) => {
    els.status.textContent = `โหลดไม่สำเร็จ: ${e.message || e}`;
    els.postList.innerHTML = `<li><p class="muted">โหลดข้อมูลไม่สำเร็จ</p></li>`;
  });

  // Auto UX refresh — ดึง feed ใหม่ทุก 5 นาที โดยไม่รีเซ็ตตัวกรองถ้าจำนวนข่าวเท่าเดิม
  setInterval(async () => {
    try {
      const prev = allPosts.length;
      await bootstrapData();
      if (allPosts.length !== prev) await route();
      else if (!location.hash.includes("/") || /^#\/r\//.exec(location.hash)) {
        // soft refresh list timestamps only
        await route();
      }
    } catch {
      /* ignore background refresh errors */
    }
  }, REFRESH_MS);
})();
