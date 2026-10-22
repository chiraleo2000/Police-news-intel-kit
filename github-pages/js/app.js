/**
 * Static reader for github-pages/data/*.json
 * Route: #/ | #/YYYY-MM-DD | #/YYYY-MM-DD/<postId> | #/downloads | #/downloads/YYYY-MM-DD
 * Missing files → empty state (ไม่ error หน้าขาว)
 */
(() => {
  const F = window.NewsFormat;
  const DATA = "data";

  const els = {
    tabNews: document.getElementById("tab-news"),
    tabDownloads: document.getElementById("tab-downloads"),
    viewNews: document.getElementById("view-news"),
    viewDownloads: document.getElementById("view-downloads"),
    dateSelect: document.getElementById("date-select"),
    downloadDateSelect: document.getElementById("download-date-select"),
    toolbar: document.getElementById("toolbar"),
    topicChips: document.getElementById("topic-chips"),
    tagFilter: document.getElementById("tag-filter"),
    searchInput: document.getElementById("search-input"),
    filterNote: document.getElementById("filter-note"),
    heroKicker: document.getElementById("hero-kicker"),
    heroTitle: document.getElementById("hero-title"),
    heroLead: document.getElementById("hero-lead"),
    heroMeta: document.getElementById("hero-meta"),
    headerStats: document.getElementById("header-stats"),
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

  function parseHash() {
    const raw = (location.hash || "#/").replace(/^#\/?/, "");
    const parts = raw.split("/").filter(Boolean);
    if (parts[0] === "downloads") {
      return {
        tab: "downloads",
        date: parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) ? parts[1] : null,
        postId: null,
      };
    }
    return {
      tab: "news",
      date: parts[0] && /^\d{4}-\d{2}-\d{2}$/.test(parts[0]) ? parts[0] : null,
      postId: parts[1] ? decodeURIComponent(parts[1]) : null,
    };
  }

  function setHash({ tab = "news", date = null, postId = null } = {}) {
    if (tab === "downloads") {
      location.hash = date ? `#/downloads/${date}` : "#/downloads";
      return;
    }
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

    const [hotspots, alerts, trends] = await Promise.all([
      fetchJson(`${DATA}/${date}_hotspots.json`).then(
        (x) => x || fetchJson(`${DATA}/${date}_hotspots_line.json`)
      ),
      fetchJson(`${DATA}/${date}_alerts.json`).then(
        (x) => x || fetchJson(`${DATA}/${date}_alerts_line.json`)
      ),
      fetchJson(`${DATA}/${date}_trends.json`).then(
        (x) => x || fetchJson(`${DATA}/${date}_trends_line.json`)
      ),
    ]);

    const dayMeta = manifest.days.find((d) => d.date === date) || { date };
    const bundle = { date, crime, hotspots, alerts, trends, dayMeta };
    dayCache.set(date, bundle);
    return bundle;
  }

  function fillDateSelect(sel, selected) {
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

  function setActiveTab(tab) {
    const isNews = tab !== "downloads";
    els.tabNews.classList.toggle("is-active", isNews);
    els.tabDownloads.classList.toggle("is-active", !isNews);
    els.viewNews.hidden = !isNews;
    els.viewDownloads.hidden = isNews;
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
      "เมื่อ task ส่งไฟล์เข้า <code>data/</code> หน้านี้จะแสดงข่าวที่รวมแหล่งซ้ำแล้ว กรองตามประเภท/แท็ก และลิงก์ต้นทาง";
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

  function byCrimeTypeFromStats(stats, posts) {
    const map = (stats && stats.by_crime_type) || {};
    let items = Object.entries(map)
      .map(([name, count]) => ({
        name,
        count: typeof count === "object" ? count.count || 0 : count,
      }))
      .filter((x) => x.count > 0);
    if (!items.length && posts) {
      const tally = {};
      for (const p of posts) {
        const t = p.topic || p.category_label;
        if (!t) continue;
        tally[t] = (tally[t] || 0) + 1;
      }
      items = Object.entries(tally).map(([name, count]) => ({ name, count }));
    }
    return items.sort((a, b) => b.count - a.count);
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

  function renderDay(bundle) {
    const { date, crime, hotspots, alerts } = bundle;
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

    els.toolbar.hidden = false;
    els.heroKicker.textContent = `สรุปวันที่ ${F.dateTh(date)}`;
    els.heroTitle.textContent = "ข่าวอาชญากรรมและการปฏิบัติหน้าที่ตำรวจ";
    els.heroLead.textContent =
      posts.length > 0
        ? `รวม ${F.number(stats.total ?? posts.length)} เหตุการณ์ (รวมแหล่งซ้ำแล้ว) จากแหล่งสาธารณะ`
        : "มีไฟล์สรุปแล้ว แต่ยังไม่มีรายการข่าวใน posts[]";
    els.heroMeta.hidden = false;
    els.heroMeta.textContent = crime.generated_at ? `สร้างเมื่อ ${crime.generated_at}` : "";

    const typeCount = byCrimeTypeFromStats(stats, posts).length;
    els.statPosts.textContent = `${F.number(stats.total ?? posts.length)} ข่าว`;
    els.statTypes.textContent = `${F.number(typeCount)} ประเภท`;
    els.statAlerts.textContent = `${F.number(stats.alerts ?? posts.filter((p) => p.alert).length)} เตือนภัย`;

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

    const types = byCrimeTypeFromStats(stats, posts);
    const spots = normalizeHotspots(hotspots).slice(0, 5);
    if (types.length || spots.length) {
      els.insights.hidden = false;
      renderBars(els.byType, types);
      renderBars(els.hotspots, spots);
    } else {
      els.insights.hidden = true;
    }

    renderTopicChips(posts);
    fillTagFilter(posts);
    renderPostList(date, posts);
    els.status.textContent = `${posts.length} เหตุการณ์ · รวมแหล่งซ้ำแล้ว · แหล่งสาธารณะ`;
  }

  function renderPostList(date, posts) {
    els.posts.hidden = false;
    els.postDetail.hidden = true;

    const filtered = applyFilters(posts);
    els.filterNote.textContent =
      filtered.length === posts.length
        ? `แสดงทั้งหมด ${posts.length} รายการ`
        : `แสดง ${filtered.length} จาก ${posts.length} รายการ`;

    els.postList.innerHTML = filtered
      .map((p) => {
        const sev = (p.severity || "").toLowerCase();
        const sources = sourceList(p);
        const chips = [
          p.topic || p.category_label
            ? `<span class="chip">${escapeHtml(p.topic || p.category_label)}</span>`
            : "",
          sev
            ? `<span class="chip sev-${escapeHtml(sev)}">${escapeHtml(F.severityLabel(sev))}</span>`
            : "",
          p.alert ? `<span class="chip alert">เตือนภัย</span>` : "",
          sources.length > 1
            ? `<span class="chip ok">${sources.length} แหล่ง</span>`
            : "",
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

        return `<li>
          <a class="post-link" href="#/${date}/${encodeURIComponent(p.id || p.slug || "")}">
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
        <a class="back" href="#/${date}">← กลับรายการ</a>
        <p>ไม่พบข่าวรหัส ${escapeHtml(postId)}</p>`;
      return;
    }

    els.posts.hidden = true;
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
      ${tags ? `<div class="post-meta" style="margin-top:0.75rem">${tags}</div>` : ""}
      ${sourceHtml}
    `;
  }

  function defaultDownloads(date) {
    return [
      {
        label: "PDF สรุปข่าว (Task 1)",
        path: `downloads/${date}_crime.pdf`,
        kind: "pdf",
      },
      {
        label: "PDF สรุปข่าวจาก LINE (Task 2)",
        path: `downloads/${date}_crime_line.pdf`,
        kind: "pdf",
      },
      {
        label: "Infographic",
        path: `downloads/${date}_infographic.png`,
        kind: "image",
      },
      {
        label: "Infographic (LINE)",
        path: `downloads/${date}_infographic_line.png`,
        kind: "image",
      },
      {
        label: "JSON ข่าว",
        path: `${date}_crime.json`,
        kind: "json",
        base: DATA,
      },
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

  async function renderDownloads(date) {
    fillDateSelect(els.downloadDateSelect, date);
    const dayMeta = manifest.days.find((d) => d.date === date) || { date };
    const listed = Array.isArray(dayMeta.downloads) ? dayMeta.downloads : [];
    const candidates = listed.length
      ? listed.map((d) => ({
          label: d.label || d.name || d.path,
          path: d.path,
          kind: d.kind || "",
        }))
      : defaultDownloads(date);

    const available = [];
    for (const item of candidates) {
      const href = resolveDownloadHref(item);
      const ok = item.path.startsWith("http") ? true : await fileExists(href);
      if (ok) available.push({ ...item, href });
    }

    const jsonPath = `${DATA}/${date}_crime.json`;
    if ((await fileExists(jsonPath)) && !available.some((a) => a.href === jsonPath)) {
      available.push({ label: "JSON ข่าวรายวัน", href: jsonPath, kind: "json" });
    }
    const jsonLine = `${DATA}/${date}_crime_line.json`;
    if ((await fileExists(jsonLine)) && !available.some((a) => a.href === jsonLine)) {
      available.push({ label: "JSON ข่าวจาก LINE", href: jsonLine, kind: "json" });
    }

    els.downloadList.innerHTML = available
      .map((item) => {
        const ext = (item.kind || item.href.split(".").pop() || "").toUpperCase();
        return `<li class="download-item">
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            <p class="muted">${escapeHtml(ext)} · ${escapeHtml(item.href)}</p>
          </div>
          <a class="download-btn" href="${escapeHtml(item.href)}" download target="_blank" rel="noopener noreferrer">ดาวน์โหลด</a>
        </li>`;
      })
      .join("");

    els.downloadEmpty.hidden = available.length > 0;
    els.downloadEmpty.textContent = available.length
      ? ""
      : `ยังไม่มีไฟล์ดาวน์โหลดสำหรับ ${F.dateTh(date)} — วาง PDF/PNG ใน data/downloads/ หรือระบุใน manifest.downloads`;
    els.status.textContent = available.length
      ? `${available.length} ไฟล์พร้อมดาวน์โหลด · ${F.dateTh(date)}`
      : "ยังไม่มีไฟล์ดาวน์โหลด";
  }

  async function route() {
    const { tab, date, postId } = parseHash();
    setActiveTab(tab);

    const fallbackDate = (manifest.days[0] && manifest.days[0].date) || "";
    fillDateSelect(els.dateSelect, date || fallbackDate);
    fillDateSelect(els.downloadDateSelect, date || fallbackDate);

    if (!manifest.days.length && !date) {
      if (tab === "downloads") {
        els.downloadList.innerHTML = "";
        els.downloadEmpty.hidden = false;
        els.status.textContent = "ยังไม่มีข้อมูลใน manifest";
        return;
      }
      showEmpty();
      return;
    }

    const useDate = date || fallbackDate;

    if (tab === "downloads") {
      if (!date && useDate) {
        setHash({ tab: "downloads", date: useDate });
        return;
      }
      await renderDownloads(useDate);
      return;
    }

    if (!date && useDate) {
      setHash({ tab: "news", date: useDate });
      return;
    }

    if (els.dateSelect.value !== useDate) els.dateSelect.value = useDate;

    els.status.textContent = "กำลังโหลด…";
    const bundle = await loadDay(useDate);
    renderDay(bundle);

    if (postId && bundle.crime && Array.isArray(bundle.crime.posts)) {
      renderPostDetail(useDate, bundle.crime.posts, postId);
    }
  }

  els.dateSelect.addEventListener("change", () => {
    if (els.dateSelect.value) setHash({ tab: "news", date: els.dateSelect.value });
  });

  els.downloadDateSelect.addEventListener("change", () => {
    if (els.downloadDateSelect.value) {
      setHash({ tab: "downloads", date: els.downloadDateSelect.value });
    }
  });

  els.tabNews.addEventListener("click", () => {
    const { date } = parseHash();
    setHash({ tab: "news", date: date || (manifest.days[0] && manifest.days[0].date) });
  });

  els.tabDownloads.addEventListener("click", () => {
    const { date } = parseHash();
    setHash({
      tab: "downloads",
      date: date || (manifest.days[0] && manifest.days[0].date),
    });
  });

  els.topicChips.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-topic]");
    if (!btn) return;
    filters.topic = btn.getAttribute("data-topic") || "";
    const { date } = parseHash();
    if (!date) return;
    const bundle = await loadDay(date);
    if (!bundle.crime) return;
    renderTopicChips(bundle.crime.posts || []);
    renderPostList(date, bundle.crime.posts || []);
  });

  els.tagFilter.addEventListener("change", async () => {
    filters.tag = els.tagFilter.value;
    const { date } = parseHash();
    if (!date) return;
    const bundle = await loadDay(date);
    if (bundle.crime) renderPostList(date, bundle.crime.posts || []);
  });

  let searchTimer;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      filters.q = els.searchInput.value;
      const { date } = parseHash();
      if (!date) return;
      const bundle = await loadDay(date);
      if (bundle.crime) renderPostList(date, bundle.crime.posts || []);
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
