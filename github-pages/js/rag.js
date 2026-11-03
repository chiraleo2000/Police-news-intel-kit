/**
 * In-browser Graph RAG. Retrieval stays in the browser; Gemma only reads that JSON.
 * Attaches window.GraphRag and window.NewsConnect.
 */
(() => {
  const CONNECT_KEY = "police-news-connect";
  const HUB_GROUPS = new Set(["หน่วย", "บุคคล", "สถานที่"]);
  const PERSON_LABELS = new Set(["สั่งการโดย", "เกี่ยวข้องกับบุคคล", "แจ้งโดย", "สืบสวนโดย"]);
  const MEASURE_ORDER = ["เม็ด", "กรัม", "กก.", "กิโลกรัม", "ลิตร", "ล้าน"];
  const LLM_MODEL = "google/gemma-4-e2b";
  const NARRATION_RULE =
    "คุณตอบคำถามผู้ใช้เป็นภาษาไทยให้จบทุกหัวข้อ ห้ามหยุดกลางประโยคหรือกลางรายการ โดยวิเคราะห์จาก JSON หลักฐานที่ให้มาเท่านั้น อธิบายโหนดที่เกี่ยวข้อง ความเชื่อมโยง และข่าวอื่นที่ร่วมโหนดเมื่อมีใน relatedThroughNodes หรือ hubs ห้ามแสดงหัวข้อแบบคำตอบจากกราฟ ห้ามแต่งชื่อคนหรือตัวเลขที่ไม่มีใน JSON ห้ามรวมหน่วยนับที่ต่างกันเป็นยอดเดียว ถ้ามีตำแหน่งหรือผู้ดำรงตำแหน่งใน JSON ให้กล่าวถึง ถ้าข้อมูลไม่พอให้บอกว่าไม่มีในหลักฐาน";

  const EXAMPLES = [
    "ผมต้องการทราบว่ากรมศุลกากรมีการห้ามปรามการเข้ามาของยาเสพติดตอนนี้ได้จำนวนทั้งหมดเท่าไร่",
    "ตอนนี้ผลงานของ ผู้บัญชาการตำรวจแห่งชาติปัจจุบันมีอะไรบ้าง",
    "ใครเป็นเลขาธิการ ก.ล.ต. ตอนนี้",
  ];

  let postsOverride = null;
  let indexCache = null;
  let lastFocusIds = [];
  let askBound = false;
  let chatQueue = Promise.resolve();
  const thread = [];

  function norm(s) {
    return String(s ?? "")
      .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function parseNum(raw) {
    let s = String(raw ?? "").trim();
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
    else s = s.replace(/,/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function defaultConnect() {
    return { publicBase: "" };
  }

  function loadConnect() {
    try {
      const raw = JSON.parse(localStorage.getItem(CONNECT_KEY) || "{}");
      return { publicBase: String(raw.publicBase || "").trim() };
    } catch {
      return defaultConnect();
    }
  }

  function saveConnect(next) {
    const saved = { publicBase: String(next?.publicBase || "").trim() };
    localStorage.setItem(CONNECT_KEY, JSON.stringify(saved));
    return saved;
  }

  function httpsOrigin(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";
    try {
      const url = new URL(text);
      if (url.protocol !== "https:") return "";
      return url.origin;
    } catch {
      return "";
    }
  }

  function urlsFromBase(base) {
    return {
      base,
      llm: `${base}/1234/v1/chat/completions`,
      mcp: `${base}/8787/mcp`,
    };
  }

  async function loadTunnel() {
    try {
      const res = await fetch(`data/tunnel.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      return data && typeof data === "object" ? data : null;
    } catch {
      return null;
    }
  }

  async function resolveEndpoints() {
    const typed = loadConnect().publicBase;
    if (typed) {
      const override = httpsOrigin(typed);
      if (!override) {
        return {
          ok: false,
          reason: "ฐาน HTTPS ไม่ถูกต้อง ต้องขึ้นต้นด้วย https:// และไม่มีพาธ",
          base: "",
          llm: "",
          mcp: "",
        };
      }
      return { ok: true, source: "browser", model: LLM_MODEL, ...urlsFromBase(override) };
    }
    const tunnel = await loadTunnel();
    const base = httpsOrigin(tunnel?.base);
    if (!base) {
      return {
        ok: false,
        reason: "ยังไม่มีฐาน HTTPS — ไม่พบ data/tunnel.json หรือค่า base ว่าง จึงยังเรียกโมเดลไม่ได้",
        base: "",
        llm: "",
        mcp: "",
      };
    }
    return {
      ok: true,
      source: "tunnel",
      model: tunnel.model || LLM_MODEL,
      updated_at: tunnel.updated_at || "",
      ...urlsFromBase(base),
    };
  }

  function roleWarningFor(title, alias) {
    const t = norm(title);
    if (!t) return false;
    for (const exact of alias?.role_titles || []) {
      if (t === norm(exact)) return true;
    }
    for (const prefix of alias?.role_prefixes || []) {
      const p = norm(prefix);
      if (p && (t === p || t.startsWith(p))) return true;
    }
    return false;
  }

  function applyTitleAliases(text, alias) {
    let out = String(text || "");
    const rules = (alias?.title_aliases || []).slice().sort((a, b) => {
      const al = Math.max(0, ...(a.phrases || []).map((p) => p.length));
      const bl = Math.max(0, ...(b.phrases || []).map((p) => p.length));
      return bl - al;
    });
    for (const rule of rules) {
      if (!rule?.title) continue;
      const phrases = (rule.phrases || []).slice().sort((a, b) => b.length - a.length);
      for (const phrase of phrases) {
        if (!phrase) continue;
        out = out.split(phrase).join(rule.title);
      }
    }
    return out;
  }

  function shareRelation(group) {
    if (group === "บุคคล") return "บุคคลเดียวกัน";
    if (group === "สถานที่") return "พื้นที่เดียวกัน";
    return "ร่วมหน่วยงาน";
  }

  function detectIntent(text) {
    if (/เท่าไหร่|เท่าไร|จำนวน|กี่ข่าว|กี่คดี/.test(text)) return "count";
    if (/ผลงาน|ที่ผ่านมา|ลำดับเหตุการณ์|ไทม์ไลน์/.test(text)) return "timeline";
    if (/ใครเป็น|ใครดำรง|ผู้ดำรงตำแหน่ง|ดำรงตำแหน่ง/.test(text)) return "office";
    return "list";
  }

  function positionSegments(value) {
    return String(value || "")
      .split(" · ")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function mentionedPositions(text, titles) {
    const q = norm(text);
    const ordered = (titles || []).slice().sort((a, b) => norm(b).length - norm(a).length);
    const hits = [];
    const spans = [];
    for (const title of ordered) {
      const needle = norm(title);
      if (needle.length < 2) continue;
      let from = 0;
      let found = false;
      while (from <= q.length - needle.length) {
        const at = q.indexOf(needle, from);
        if (at < 0) break;
        const end = at + needle.length;
        const covered = spans.some(([start, stop]) => at >= start && end <= stop);
        if (!covered) {
          spans.push([at, end]);
          found = true;
          break;
        }
        from = at + 1;
      }
      if (found) hits.push(title);
    }
    return hits;
  }

  function detectCrimeTypes(question, titles) {
    const q = norm(question);
    const hits = (titles || []).filter((t) => {
      const n = norm(t);
      return n.length >= 4 && q.includes(n);
    });
    hits.sort((a, b) => norm(b).length - norm(a).length);
    const kept = [];
    for (const title of hits) {
      const n = norm(title);
      if (kept.some((k) => norm(k).includes(n) && norm(k) !== n)) continue;
      kept.push(title);
    }
    return kept;
  }

  function buildIndex(graph, posts, alias) {
    const nodes = graph?.nodes || [];
    const edges = graph?.edges || [];
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    const casesById = new Map(nodes.filter((n) => n.kind === "case").map((n) => [n.id, n]));
    const postsById = new Map();
    for (const post of posts || []) {
      if (post?.id) postsById.set(String(post.id), post);
      if (post?.slug) postsById.set(String(post.slug), post);
    }
    const crimeTypes = [
      ...new Set(
        nodes
          .filter((n) => n.kind === "crime_type" && n.title)
          .map((n) => n.title)
          .concat(nodes.filter((n) => n.kind === "case" && n.crime_type).map((n) => n.crime_type))
      ),
    ];
    const parents = [];
    const entityParent = new Map();
    for (const rule of alias?.parents || []) {
      const title = norm(rule.title || "");
      const token = norm(rule.contains || "");
      const members = nodes.filter((n) => {
        if (n.kind !== "entity") return false;
        const t = norm(n.title);
        if (title && t === title) return true;
        return Boolean(token) && t.includes(token);
      });
      const exact = members
        .filter((n) => norm(n.title) === title)
        .sort((a, b) => (b.degree || 0) - (a.degree || 0));
      const real = exact[0] || null;
      const id = real?.id || rule.virtual_id || `hub:${rule.title || members.length}`;
      const hub = {
        key: id,
        id,
        title: rule.title || real?.title || "",
        entity_group: rule.entity_group || real?.entity_group || "หน่วย",
        virtual: !real,
        memberIds: members.map((n) => n.id),
        roleWarning: roleWarningFor(rule.title || "", alias),
        position: real?.position || "",
        current_holder: real?.current_holder || "",
      };
      parents.push(hub);
      for (const member of members) {
        if (!entityParent.has(member.id)) entityParent.set(member.id, hub);
      }
    }
    const hubEntities = nodes.filter((n) => n.kind === "entity" && HUB_GROUPS.has(n.entity_group));
    const positionTitles = [];
    const seenPos = new Set();
    for (const node of nodes) {
      for (const seg of positionSegments(node.position)) {
        const key = norm(seg);
        if (!key || seenPos.has(key)) continue;
        seenPos.add(key);
        positionTitles.push(seg);
      }
    }
    return {
      nodesById,
      casesById,
      postsById,
      edges,
      crimeTypes,
      parents,
      entityParent,
      hubEntities,
      positionTitles,
      alias: alias || {},
    };
  }

  function extractKeywords(question, index) {
    const aliased = applyTitleAliases(question, index.alias);
    const qn = norm(aliased);
    const candidates = [];
    const addCandidate = (kind, title, minLen = 2) => {
      const text = String(title || "").trim();
      const key = norm(text);
      if (!text || key.length < minLen) return;
      candidates.push({ kind, title: text, key, len: key.length });
    };

    for (const title of index.positionTitles || []) addCandidate("position", title, 2);
    for (const parent of index.parents || []) {
      addCandidate("org", parent.title, 3);
      const rule = (index.alias.parents || []).find((p) => (p.title || "") === parent.title) || {};
      if (rule.contains) addCandidate("org", parent.title, 3);
      // Prefer the canonical parent title when the contains-token matches.
      if (rule.contains) {
        candidates.push({
          kind: "org",
          title: parent.title,
          key: norm(rule.contains),
          len: norm(rule.contains).length,
          display: parent.title,
        });
      }
    }
    for (const title of index.crimeTypes || []) addCandidate("crime", title, 3);
    for (const ent of index.hubEntities || []) {
      addCandidate("entity", ent.title, 3);
      if (ent.current_holder) addCandidate("holder", ent.current_holder, 3);
    }

    const kindRank = { position: 0, org: 1, entity: 2, holder: 3, crime: 4 };
    candidates.sort(
      (a, b) => b.len - a.len || (kindRank[a.kind] ?? 9) - (kindRank[b.kind] ?? 9)
    );
    const keywords = [];
    const spans = [];
    const seen = new Set();
    for (const item of candidates) {
      let from = 0;
      while (from <= qn.length - item.len) {
        const at = qn.indexOf(item.key, from);
        if (at < 0) break;
        const end = at + item.len;
        const overlaps = spans.some(([start, stop]) => at < stop && end > start);
        if (!overlaps) {
          spans.push([at, end]);
          const title = item.display || item.title;
          const dedupe = `${item.kind}:${norm(title)}`;
          if (!seen.has(dedupe)) {
            seen.add(dedupe);
            keywords.push({ kind: item.kind, title });
          }
          break;
        }
        from = at + 1;
      }
    }

    return {
      aliased,
      qn,
      keywords,
      positionHits: keywords.filter((item) => item.kind === "position").map((item) => item.title),
    };
  }

  function matchHubs(question, index) {
    const { keywords } = extractKeywords(question, index);
    const hubs = [];
    const seen = new Set();
    const wantedOrg = new Set(keywords.filter((item) => item.kind === "org").map((item) => norm(item.title)));
    const wantedEntity = new Set(keywords.filter((item) => item.kind === "entity").map((item) => norm(item.title)));
    const wantedHolder = new Set(keywords.filter((item) => item.kind === "holder").map((item) => norm(item.title)));
    const wantedPos = new Set(keywords.filter((item) => item.kind === "position").map((item) => norm(item.title)));

    for (const parent of index.parents) {
      const hit = wantedOrg.has(norm(parent.title));
      if (!hit || seen.has(parent.key)) continue;
      seen.add(parent.key);
      hubs.push(parent);
    }

    const absorbed = new Set();
    for (const hub of hubs) for (const id of hub.memberIds) absorbed.add(id);
    const entities = index.hubEntities.slice().sort((a, b) => norm(b.title).length - norm(a.title).length);
    for (const ent of entities) {
      const hitTitle = wantedEntity.has(norm(ent.title));
      const hitHolder = Boolean(ent.current_holder) && wantedHolder.has(norm(ent.current_holder));
      const hitPos = positionSegments(ent.position).some((seg) => wantedPos.has(norm(seg)));
      if (!hitTitle && !hitHolder && !hitPos) continue;
      if (absorbed.has(ent.id) || seen.has(ent.id)) continue;
      const t = norm(ent.title);
      if (hitTitle && hubs.some((h) => norm(h.title).includes(t) && norm(h.title) !== t)) continue;
      seen.add(ent.id);
      hubs.push({
        key: ent.id,
        id: ent.id,
        title: ent.title,
        entity_group: ent.entity_group,
        virtual: false,
        memberIds: [ent.id],
        roleWarning: roleWarningFor(ent.title, index.alias),
        position: ent.position || "",
        current_holder: ent.current_holder || "",
        matchedBy: hitHolder ? "holder" : hitPos ? "position" : "title",
      });
      absorbed.add(ent.id);
    }
    hubs._keywords = keywords;
    return hubs;
  }

  function expandFocusIds(ids, index, opts = {}) {
    const seed = new Set((ids || []).filter(Boolean));
    const out = new Set(seed);
    const maxExtra = Number.isFinite(opts.maxExtra) ? opts.maxExtra : 40;
    let added = 0;
    for (const id of seed) {
      if (added >= maxExtra) break;
      for (const edge of index.edges || []) {
        if (added >= maxExtra) break;
        let other = null;
        if (edge.source === id) other = edge.target;
        else if (edge.target === id) other = edge.source;
        if (!other || out.has(other)) continue;
        const node = index.nodesById.get(other);
        if (!node) continue;
        if (node.kind === "crime_type" || (node.kind === "entity" && HUB_GROUPS.has(node.entity_group))) {
          out.add(other);
          added += 1;
        }
      }
    }
    return [...out];
  }

  function linkedCases(hub, index, opts) {
    const members = new Set(hub.memberIds);
    const found = new Map();
    for (const edge of index.edges) {
      let entId = null;
      let caseId = null;
      if (members.has(edge.source)) {
        entId = edge.source;
        caseId = edge.target;
      } else if (members.has(edge.target)) {
        entId = edge.target;
        caseId = edge.source;
      } else continue;
      const node = index.casesById.get(caseId);
      if (!node) continue;
      const label = String(edge.label || "").trim();
      if (opts.personEdges && !PERSON_LABELS.has(label)) continue;
      if (opts.applyCrime && opts.crimeTypes?.length && !opts.crimeTypes.includes(node.crime_type || "")) continue;
      const postId = node.case_id || String(node.id).replace(/^20_Cases\//, "");
      const post = index.postsById.get(String(postId)) || null;
      const routeDate = post?._date || node.date || "";
      const filterDate = node.date || routeDate;
      if (opts.applyWindow && (opts.dateFrom || opts.dateTo)) {
        if (!filterDate) continue;
        if (opts.dateFrom && filterDate < opts.dateFrom) continue;
        if (opts.dateTo && filterDate > opts.dateTo) continue;
      }
      if (!found.has(node.id)) {
        found.set(node.id, {
          node,
          post,
          postId: String(postId),
          routeDate,
          filterDate,
          labels: new Set(),
          via: new Set(),
        });
      }
      const row = found.get(node.id);
      if (label) row.labels.add(label);
      row.via.add(entId);
    }
    return [...found.values()];
  }

  function mergeRows(lists) {
    const map = new Map();
    for (const list of lists) {
      for (const row of list) {
        const cur = map.get(row.node.id);
        if (!cur) {
          map.set(row.node.id, row);
          continue;
        }
        for (const label of row.labels) cur.labels.add(label);
        for (const via of row.via) cur.via.add(via);
      }
    }
    return [...map.values()];
  }

  function usesPersonEdges(hub) {
    if (hub.roleWarning) return true;
    return hub.entity_group === "บุคคล";
  }

  function orgNames(row, index, canonicalTitle) {
    const titles = [...row.via].map((id) => index.nodesById.get(id)?.title).filter(Boolean);
    const specific = canonicalTitle ? titles.filter((t) => norm(t) !== norm(canonicalTitle)) : titles;
    return (specific.length ? specific : titles).slice(0, 3).join(", ");
  }

  function toEvidence(row, index, canonicalTitle) {
    const excerptSource = row.post?.exec_blurb || row.node.excerpt || "";
    const excerpt = String(excerptSource).replace(/\s+/g, " ").trim().slice(0, 420);
    const date = row.routeDate || "";
    return {
      id: row.postId,
      nodeId: row.node.id,
      date,
      graphDate: row.node.date || "",
      title: row.post?.title || row.node.title || row.postId,
      excerpt,
      href: date ? `#/${date}/${encodeURIComponent(row.postId)}` : `#/brain/${encodeURIComponent(row.node.id)}`,
      pdf: date ? `downloads/${date}_crime.pdf` : "",
      infographic: date ? `downloads/${date}_infographic.png` : "",
      crime_type: row.node.crime_type || "",
      labels: [...row.labels],
      org: orgNames(row, index, canonicalTitle),
      position: row.node.position || "",
    };
  }

  function extractQuantities(text) {
    const src = String(text || "");
    const hits = [];
    const spans = [];
    const re = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(ล้าน)?\s*(กิโลกรัม|กรัม|กก\.?|เม็ด|ลิตร)/g;
    let m;
    while ((m = re.exec(src))) {
      const base = parseNum(m[1]);
      if (base == null) continue;
      let unit = m[3];
      if (unit === "กก") unit = "กก.";
      const value = m[2] ? base * 1000000 : base;
      hits.push({
        unit,
        value,
        display: m[0].replace(/\s+/g, " ").trim(),
      });
      spans.push([m.index, m.index + m[0].length]);
    }
    const reMillion = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*ล้าน/g;
    while ((m = reMillion.exec(src))) {
      const start = m.index;
      const end = start + m[0].length;
      if (spans.some(([a, b]) => start < b && end > a)) continue;
      const base = parseNum(m[1]);
      if (base == null) continue;
      hits.push({
        unit: "ล้าน",
        value: base,
        display: m[0].replace(/\s+/g, " ").trim(),
      });
    }
    return hits;
  }

  function groupQuantities(rows) {
    const groups = new Map();
    for (const row of rows) {
      const text = `${row.node.title || ""}\n${row.node.excerpt || ""}`;
      const seen = new Set();
      for (const hit of extractQuantities(text)) {
        const key = `${hit.unit}|${hit.display}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!groups.has(hit.unit)) groups.set(hit.unit, []);
        groups.get(hit.unit).push({
          unit: hit.unit,
          value: hit.value,
          display: hit.display,
          org: row.org || "",
          title: row.title,
          date: row.date,
          href: row.href,
        });
      }
    }
    return [...groups.keys()]
      .sort((a, b) => {
        const ia = MEASURE_ORDER.indexOf(a);
        const ib = MEASURE_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      })
      .map((unit) => ({
        unit,
        note: "ตัวเลขจากหัวข้อและข้อความข่าว ไม่ใช่ยอดอย่างเป็นทางการ",
        items: groups.get(unit),
      }));
  }

  function sortRows(rows, intent) {
    const dir = intent === "timeline" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const da = a.filterDate || a.routeDate || "";
      const db = b.filterDate || b.routeDate || "";
      if (da !== db) return da < db ? -dir : dir;
      return String(a.node.title || "").localeCompare(String(b.node.title || ""), "th");
    });
  }

  function emptyResult(message, extra) {
    return {
      ok: false,
      message,
      intent: extra?.intent || "list",
      crimeTypes: extra?.crimeTypes || [],
      dateFrom: extra?.dateFrom || "",
      dateTo: extra?.dateTo || "",
      hubs: extra?.hubs || [],
      caseCount: null,
      quantities: [],
      oldLinks: [],
      evidence: [],
      warnings: [],
      focusIds: [],
      holder: null,
    };
  }

  function caseRow(node, index) {
    const postId = node.case_id || String(node.id).replace(/^20_Cases\//, "");
    const post = index.postsById.get(String(postId)) || null;
    const routeDate = post?._date || node.date || "";
    return {
      node,
      post,
      postId: String(postId),
      routeDate,
      filterDate: node.date || routeDate,
      labels: new Set(),
      via: new Set(),
    };
  }

  function rowsCarrying(index, opts, predicate) {
    const rows = [];
    for (const node of index.casesById.values()) {
      if (!predicate(node)) continue;
      const row = caseRow(node, index);
      if (opts.applyCrime && opts.crimeTypes?.length && !opts.crimeTypes.includes(node.crime_type || "")) continue;
      if (opts.applyWindow && (opts.dateFrom || opts.dateTo)) {
        if (!row.filterDate) continue;
        if (opts.dateFrom && row.filterDate < opts.dateFrom) continue;
        if (opts.dateTo && row.filterDate > opts.dateTo) continue;
      }
      rows.push(row);
    }
    return rows;
  }

  function rowsForHubPosition(hub, index, opts) {
    const needles = [];
    const title = norm(hub.title);
    if (title.length >= 3) needles.push(title);
    const rule = (index.alias.parents || []).find((item) => (item.title || "") === hub.title) || {};
    const token = norm(rule.contains || "");
    if (token.length >= 3 && token !== title) needles.push(token);
    if (!needles.length) return [];
    return rowsCarrying(index, opts, (node) => {
      const pos = norm(node.position || "");
      return Boolean(pos) && needles.some((needle) => pos.includes(needle));
    });
  }

  function rowsForExactPosition(title, index, opts) {
    const want = norm(title);
    return rowsCarrying(index, opts, (node) => positionSegments(node.position).some((seg) => norm(seg) === want));
  }

  function holderForTitle(title, index) {
    const want = norm(title);
    const nodes = [...index.nodesById.values()];
    const carries = (node) => positionSegments(node.position).some((seg) => norm(seg) === want);
    const person = nodes.find((node) => node.kind === "entity" && node.entity_group === "บุคคล" && carries(node));
    const org =
      nodes.find((node) => node.kind === "entity" && node.entity_group === "หน่วย" && node.current_holder && carries(node)) ||
      nodes.find((node) => node.kind === "entity" && node.entity_group === "หน่วย" && carries(node));
    const name = String(org?.current_holder || person?.title || "").trim();
    if (!name) return null;
    const orgFromPerson = String(person?.position_org || "")
      .split(" · ")
      .map((part) => part.trim())
      .filter(Boolean)[0];
    return {
      title,
      name,
      org: org?.title || orgFromPerson || "",
      orgId: org?.id || "",
      personId: person?.id || "",
    };
  }

  function pushNodeHub(hubs, node, index) {
    if (!node) return;
    if (hubs.some((hub) => hub.id === node.id || hub.memberIds?.includes(node.id))) return;
    hubs.push({
      key: node.id,
      id: node.id,
      title: node.title,
      entity_group: node.entity_group,
      virtual: false,
      memberIds: [node.id],
      roleWarning: Boolean(roleWarningFor(node.title, index.alias) && !node.current_holder && node.entity_group !== "บุคคล"),
      position: node.position || "",
      current_holder: node.current_holder || "",
    });
  }

  function sharedRoleWarning(title) {
    return `โหนด «${title}» เป็นตำแหน่งหรือบทบาทที่ใช้ร่วมกัน ไม่ใช่บุคคลคนเดียวที่ระบุตัวตนได้`;
  }

  function answerFromIndex(index, text, opts = {}) {
    const question = String(text || "").trim();
    const dateFrom = opts.dateFrom || "";
    const dateTo = opts.dateTo || "";
    const intent = detectIntent(question);
    const crimeTypes = detectCrimeTypes(question, index.crimeTypes);
    if (!question) {
      return emptyResult("ยังไม่มีคำถาม จึงไม่รายงานจำนวน", { intent, dateFrom, dateTo });
    }
    const extracted = extractKeywords(question, index);
    const aliased = extracted.aliased;
    const positions = extracted.positionHits || mentionedPositions(aliased, index.positionTitles || []);
    const hubs = matchHubs(question, index);
    const keywords = extracted.keywords || hubs._keywords || [];
    const holderHits = [];
    for (const title of positions) {
      const info = holderForTitle(title, index);
      if (!info) continue;
      holderHits.push(info);
      pushNodeHub(hubs, index.nodesById.get(info.orgId), index);
      pushNodeHub(hubs, index.nodesById.get(info.personId), index);
    }
    // Shared roles like ผบ.ตร. after folding: attach a virtual hub so retrieval still has a name.
    for (const title of positions) {
      if (holderHits.some((hit) => norm(hit.title) === norm(title))) continue;
      if (hubs.some((hub) => norm(hub.title) === norm(title))) continue;
      hubs.push({
        key: `position:${title}`,
        id: `position:${title}`,
        title,
        entity_group: "บุคคล",
        virtual: true,
        memberIds: [],
        roleWarning: true,
        position: title,
        current_holder: "",
      });
    }
    const loose = positions.filter((title) => !holderHits.some((hit) => norm(hit.title) === norm(title)));
    if (!hubs.length && !loose.length && !keywords.length) {
      return emptyResult("ไม่พบหน่วยงาน บุคคล หรือสถานที่ในคลังที่ตรงกับคำถามนี้ จึงไม่รายงานจำนวน", {
        intent,
        crimeTypes,
        dateFrom,
        dateTo,
      });
    }
    const windowed = { crimeTypes, dateFrom, dateTo, applyCrime: true, applyWindow: true };
    const open = { crimeTypes, applyCrime: false, applyWindow: false };
    const evidenceLists = [];
    const oldLists = [];
    for (const hub of hubs) {
      evidenceLists.push(linkedCases(hub, index, { ...windowed, personEdges: usesPersonEdges(hub) }));
      evidenceLists.push(rowsForHubPosition(hub, index, windowed));
      oldLists.push(linkedCases(hub, index, { ...open, personEdges: false }));
      oldLists.push(rowsForHubPosition(hub, index, open));
    }
    for (const title of loose) {
      evidenceLists.push(rowsForExactPosition(title, index, windowed));
      oldLists.push(rowsForExactPosition(title, index, open));
    }
    const evidenceRows = sortRows(mergeRows(evidenceLists), intent);
    const evidenceIds = new Set(evidenceRows.map((row) => row.node.id));
    const oldRows = sortRows(
      mergeRows(oldLists).filter((row) => !evidenceIds.has(row.node.id)),
      "list"
    );
    const canonicalTitle = hubs.length === 1 ? hubs[0].title : "";
    const evidence = evidenceRows.map((row) => {
      const item = toEvidence(row, index, canonicalTitle);
      row.org = item.org;
      row.title = item.title;
      row.date = item.date;
      row.href = item.href;
      return item;
    });
    const oldEvidence = oldRows.map((row) => toEvidence(row, index, canonicalTitle));
    const warnings = [];
    const warnSeen = new Set();
    const addWarn = (text) => {
      if (!text || warnSeen.has(text)) return;
      warnSeen.add(text);
      warnings.push(text);
    };
    for (const hub of hubs) {
      if (hub.roleWarning) addWarn(sharedRoleWarning(hub.title));
    }
    for (const title of loose) addWarn(sharedRoleWarning(title));
    const focusIds = [];
    const seenFocus = new Set();
    const pushFocus = (id) => {
      if (!id || seenFocus.has(id) || !index.nodesById.has(id)) return;
      seenFocus.add(id);
      focusIds.push(id);
    };
    for (const hub of hubs) {
      if (!hub.virtual) pushFocus(hub.id);
      for (const id of hub.memberIds) pushFocus(id);
    }
    for (const row of evidenceRows) pushFocus(row.node.id);
    for (const row of oldRows) pushFocus(row.node.id);
    for (const kw of keywords) {
      if (kw.kind !== "crime") continue;
      const crimeNode = [...index.nodesById.values()].find(
        (node) => node.kind === "crime_type" && norm(node.title) === norm(kw.title)
      );
      if (crimeNode) pushFocus(crimeNode.id);
    }
    const expandedFocus = expandFocusIds(focusIds, index);
    focusIds.length = 0;
    for (const id of expandedFocus) focusIds.push(id);
    const quantities = groupQuantities(evidenceRows);
    const oldLinks = hubs
      .map((hub) => {
        const memberIds = new Set(hub.memberIds);
        const cases = oldEvidence.filter((item) => {
          const row = oldRows.find((r) => r.node.id === item.nodeId);
          if (!row) return false;
          for (const via of row.via) if (memberIds.has(via)) return true;
          return false;
        });
        return {
          hubTitle: hub.title,
          entityGroup: hub.entity_group,
          relation: shareRelation(hub.entity_group),
          cases: cases.map((item) => ({
            id: item.id,
            date: item.date,
            title: item.title,
            href: item.href,
            crime_type: item.crime_type,
          })),
        };
      })
      .filter((group) => group.cases.length);
    const windowNote =
      !dateFrom && !dateTo ? "ทุกวันที่ในคลัง" : `${dateFrom || "…"} ถึง ${dateTo || "…"}`;
    const names = hubs.length ? hubs.map((hub) => hub.title).join(", ") : positions.join(", ");
    const primaryHolder = holderHits[0] || null;
    let message = "";
    if (intent === "office" && primaryHolder) {
      message = `${primaryHolder.name} ดำรงตำแหน่ง${primaryHolder.title}`;
      if (evidence.length) {
        message += primaryHolder.org
          ? ` และมีข่าวของ ${primaryHolder.org} ${evidence.length} ข่าว`
          : ` และมีข่าวที่เชื่อมในกราฟ ${evidence.length} ข่าว`;
      }
    } else if (!evidence.length) {
      message = `พบ ${names} แต่ไม่มีข่าวที่ตรงเงื่อนไขในช่วง ${windowNote}`;
    } else if (intent === "count") {
      message = `พบ ${evidence.length} ข่าวที่เชื่อมกับ ${names}`;
    } else if (intent === "timeline") {
      message = `ลำดับข่าวที่เชื่อมกับ ${names} จำนวน ${evidence.length} ข่าว`;
    } else {
      message = `รายการข่าวที่เชื่อมกับ ${names} จำนวน ${evidence.length} ข่าว`;
    }
    if (crimeTypes.length) message += ` · ประเภท ${crimeTypes.join(", ")}`;
    return {
      ok: true,
      message,
      intent,
      crimeTypes,
      dateFrom,
      dateTo,
      windowNote,
      hubs: hubs.map((hub) => ({
        id: hub.id,
        title: hub.title,
        entity_group: hub.entity_group,
        virtual: hub.virtual,
        roleWarning: hub.roleWarning,
        position: hub.position || index.nodesById.get(hub.id)?.position || "",
        current_holder: hub.current_holder || index.nodesById.get(hub.id)?.current_holder || "",
      })),
      holder: primaryHolder
        ? { name: primaryHolder.name, position: primaryHolder.title, org: primaryHolder.org }
        : null,
      caseCount: evidence.length,
      quantities,
      oldLinks,
      evidence,
      warnings,
      keywords,
      focusIds,
    };
  }

  async function ensureIndex() {
    if (indexCache) return indexCache;
    let graph = window.BrainGraph?.getGraph?.() || null;
    if (!graph) {
      const res = await fetch(`data/graph.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("ไม่พบ data/graph.json");
      graph = await res.json();
      if (!graph.positions_folded && window.PositionFold?.foldPositions) {
        let registry = { offices: [], title_prefixes: [] };
        try {
          const pres = await fetch(`data/positions.json?t=${Date.now()}`, { cache: "no-store" });
          if (pres.ok) registry = await pres.json();
        } catch {
          /* fold with an empty registry rather than skipping the graph */
        }
        graph = window.PositionFold.foldPositions(graph, registry);
      }
    }
    let posts = postsOverride;
    if (!posts?.length && window.NewsApp?.getPosts) posts = window.NewsApp.getPosts();
    if (!posts?.length) {
      try {
        const res = await fetch(`data/feed.json?t=${Date.now()}`, { cache: "no-store" });
        const feed = res.ok ? await res.json() : null;
        posts = feed?.posts || [];
      } catch {
        posts = [];
      }
    }
    let alias = { parents: [] };
    try {
      const res = await fetch(`data/entity-aliases.json?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) alias = await res.json();
    } catch {
      /* rollup stays empty */
    }
    indexCache = buildIndex(graph, posts, alias);
    return indexCache;
  }

  async function answerQuestion(text, opts) {
    const index = await ensureIndex();
    return answerFromIndex(index, text, opts || {});
  }

  function renderResult(result, opts = {}) {
    if (!result?.ok && result?.caseCount == null) {
      return `<div class="rag-answer"><p class="brain-kind">หลักฐานที่ค้นจากกราฟรอบนี้</p><h3>ไม่พบข้อมูลที่ตรงกัน</h3><p>${escapeHtml(result?.message || "ไม่รายงานจำนวน")}</p></div>`;
    }
    const warnings = (result.warnings || [])
      .map((w) => `<p class="rag-warn">${escapeHtml(w)}</p>`)
      .join("");
    const hubLine = (result.hubs || []).map((h) => escapeHtml(h.title)).join(", ");
    const crimeLine = (result.crimeTypes || []).length
      ? ` · ประเภท ${escapeHtml(result.crimeTypes.join(", "))}`
      : "";
    const holderBlock = result.holder?.name
      ? `<p class="rag-holder">ผู้ดำรงตำแหน่งปัจจุบัน <strong>${escapeHtml(result.holder.name)}</strong>${
          result.holder.position ? ` · ${escapeHtml(result.holder.position)}` : ""
        }${result.holder.org ? ` · ${escapeHtml(result.holder.org)}` : ""}</p>`
      : "";
    const countBlock =
      result.caseCount == null
        ? ""
        : `<p class="rag-count"><strong>${result.caseCount}</strong> ข่าว</p><p class="muted">จำนวนนี้คือนับข่าวที่เชื่อมในกราฟ ไม่ใช่ยอดยึดอย่างเป็นทางการ</p>`;
    const qty = (result.quantities || [])
      .map((group) => {
        const items = (group.items || [])
          .map(
            (item) =>
              `<li><span class="rag-qty">${escapeHtml(item.display)}</span>${
                item.org ? ` · ${escapeHtml(item.org)}` : ""
              } · <a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a></li>`
          )
          .join("");
        return `<section class="rag-qty-group"><h4>${escapeHtml(group.unit)}</h4><p class="muted">${escapeHtml(group.note)}</p><ul>${items}</ul></section>`;
      })
      .join("");
    const list = (result.evidence || [])
      .map((item) => {
        const files = [
          item.pdf ? `<a href="data/${escapeHtml(item.pdf)}">PDF</a>` : "",
          item.infographic ? `<a href="data/${escapeHtml(item.infographic)}">Infographic</a>` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        const when = item.date ? escapeHtml(item.date) : "";
        const graphWhen =
          item.graphDate && item.graphDate !== item.date
            ? ` · วันที่ในกราฟ ${escapeHtml(item.graphDate)}`
            : "";
        return `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a><p class="muted">${when}${graphWhen}${
          item.crime_type ? ` · ${escapeHtml(item.crime_type)}` : ""
        }${item.org ? ` · ${escapeHtml(item.org)}` : ""}</p>${
          item.excerpt ? `<p>${escapeHtml(item.excerpt)}</p>` : ""
        }${files ? `<p class="rag-files">${files}</p>` : ""}</li>`;
      })
      .join("");
    const old = (result.oldLinks || [])
      .map((group) => {
        const items = (group.cases || [])
          .map(
            (item) =>
              `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a> <span class="muted">${escapeHtml(item.date || "")}${
                item.crime_type ? ` · ${escapeHtml(item.crime_type)}` : ""
              }</span></li>`
          )
          .join("");
        return `<section><h4>${escapeHtml(group.relation)} · ${escapeHtml(group.hubTitle)}</h4><ul>${items}</ul></section>`;
      })
      .join("");
    const listTitle = result.intent === "timeline" ? "ลำดับข่าว" : "ข่าวที่ตรงเงื่อนไข";
    return `<div class="rag-answer">
      <p class="brain-kind">หลักฐานที่ค้นจากกราฟรอบนี้</p>
      <p class="muted">สรุปการค้นนี้สร้างจากโหนดและข่าวที่ตรงคำถามรอบนี้ ไม่ใช่ข้อความสำเร็จรูป</p>
      <h3>${escapeHtml(result.message || "")}</h3>
      ${warnings}
      ${holderBlock}
      <p class="muted">${escapeHtml(result.windowNote || "")}${hubLine ? ` · ${hubLine}` : ""}${crimeLine}</p>
      ${countBlock}
      ${qty ? `<section><h4>ตัวเลขจากข้อความข่าว แยกตามหน่วยนับ</h4>${qty}</section>` : ""}
      ${list ? `<section><h4>${listTitle}</h4><ol class="rag-cases">${list}</ol></section>` : ""}
      ${
        old
          ? `<section><h4>ข่าวอื่นที่ร่วมโหนด</h4><p class="muted">เส้นนี้ใช้ในแผงผลลัพธ์และตอนโฟกัส ไม่ได้ลากบนกราฟภาพรวม</p>${old}</section>`
          : `<p class="muted">ไม่มีข่าวอื่นที่ร่วมโหนดนี้นอกจากรายการด้านบน</p>`
      }
      ${
        opts.focus !== false && (result.focusIds || []).length
          ? `<p><button type="button" class="btn-ghost" data-rag-focus>โฟกัสกราฟเฉพาะกลุ่มนี้</button></p>`
          : ""
      }
    </div>`;
  }

  function narrationPayload(result) {
    return {
      intent: result.intent,
      caseCount: result.caseCount,
      crimeTypes: result.crimeTypes || [],
      keywords: result.keywords || [],
      warnings: result.warnings || [],
      window: result.windowNote || "",
      holder: result.holder || null,
      hubs: (result.hubs || []).map((hub) => ({
        title: hub.title,
        entity_group: hub.entity_group,
        roleWarning: Boolean(hub.roleWarning),
        position: hub.position || "",
        current_holder: hub.current_holder || "",
      })),
      relatedThroughNodes: (result.oldLinks || []).map((group) => ({
        relation: group.relation,
        hubTitle: group.hubTitle,
        cases: (group.cases || []).slice(0, 8).map((item) => ({
          title: item.title,
          date: item.date,
          crime_type: item.crime_type,
          href: item.href,
        })),
      })),
      quantities: (result.quantities || []).map((group) => ({
        unit: group.unit,
        note: group.note,
        items: (group.items || []).map((item) => ({
          display: item.display,
          org: item.org,
          title: item.title,
          date: item.date,
          href: item.href,
        })),
      })),
      evidence: (result.evidence || []).slice(0, 12).map((item) => ({
        title: item.title,
        excerpt: String(item.excerpt || "").slice(0, 180),
        date: item.date,
        href: item.href,
        position: item.position || "",
      })),
    };
  }

  function llmFailureReason(status, data) {
    const blob = JSON.stringify(data || {}).toLowerCase();
    if (status === 404 || /model|not loaded|does not exist|unknown model|failed to load|no models loaded/.test(blob)) {
      return "โมเดล google/gemma-4-e2b ยังไม่ถูกโหลดใน LM Studio";
    }
    return `เซิร์ฟเวอร์ตอบรหัส ${status}`;
  }

  async function completeChatOnce(url, messages) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          temperature: 0.2,
          max_tokens: 8192,
          messages,
        }),
      });
    } catch {
      return { ok: false, reason: "เรียกโมเดลไม่สำเร็จ เพราะเครือข่ายหรือถูกบล็อก" };
    }
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!data || typeof data !== "object") {
      return { ok: false, reason: "เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON" };
    }
    if (!res.ok) return { ok: false, reason: llmFailureReason(res.status, data) };
    const text = String(data?.choices?.[0]?.message?.content || "");
    if (!text.trim()) return { ok: false, reason: "โมเดลไม่ส่งข้อความกลับ" };
    return {
      ok: true,
      text,
      truncated: data?.choices?.[0]?.finish_reason === "length",
    };
  }

  async function completeChat(url, messages) {
    const convo = messages.map((message) => ({ role: message.role, content: message.content }));
    let text = "";
    for (let pass = 0; pass < 4; pass += 1) {
      const once = await completeChatOnce(url, convo);
      if (!once.ok) return text.trim() ? { ok: true, text: text.trim() } : once;
      text += once.text;
      if (!once.truncated) break;
      convo.push({ role: "assistant", content: once.text });
      convo.push({
        role: "user",
        content: "คำตอบยังไม่จบ เขียนต่อจากอักขระสุดท้ายทันที ห้ามขึ้นต้นใหม่และห้ามย้ำส่วนที่เขียนไปแล้ว",
      });
    }
    return { ok: true, text: text.trim() };
  }

  function renderModelText(raw) {
    const lines = escapeHtml(raw).replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let list = null;
    let ordered = false;
    const flush = () => {
      if (!list) return;
      html.push(ordered ? `<ol>${list.join("")}</ol>` : `<ul>${list.join("")}</ul>`);
      list = null;
    };
    const inline = (line) => line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    for (const line of lines) {
      const item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
      if (item) {
        const nextOrdered = /^\s*\d+\./.test(line);
        if (!list || ordered !== nextOrdered) {
          flush();
          list = [];
          ordered = nextOrdered;
        }
        list.push(`<li>${inline(item[1])}</li>`);
        continue;
      }
      flush();
      if (!line.trim()) continue;
      const heading = line.match(/^#{1,3}\s+(.*)$/);
      html.push(heading ? `<h4>${inline(heading[1])}</h4>` : `<p>${inline(line)}</p>`);
    }
    flush();
    return html.join("");
  }

  function priorMessages() {
    return thread.slice(-3).flatMap((turn) => {
      const reply = String(turn.llmText || turn.result?.message || "").slice(0, 500);
      const msgs = [{ role: "user", content: String(turn.question || "").slice(0, 400) }];
      if (reply) msgs.push({ role: "assistant", content: reply });
      return msgs;
    });
  }

  async function askModel(question, result) {
    const endpoints = await resolveEndpoints();
    if (!endpoints.ok) return { ok: false, reason: endpoints.reason };
    const history = priorMessages();
    return completeChat(endpoints.llm, [
      { role: "system", content: NARRATION_RULE },
      ...history,
      { role: "user", content: JSON.stringify({ question, ...narrationPayload(result) }) },
    ]);
  }

  function parseRpcBody(text) {
    try {
      return JSON.parse(text);
    } catch {
      /* SSE or plain text */
    }
    const lines = String(text || "")
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"));
    for (const line of lines) {
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        return JSON.parse(payload);
      } catch {
        /* next line */
      }
    }
    return null;
  }

  async function testMcp(url) {
    let endpoint = String(url || "").trim();
    if (!endpoint) {
      const endpoints = await resolveEndpoints();
      if (!endpoints.ok) return { ok: false, message: endpoints.reason, names: [] };
      endpoint = endpoints.mcp;
    }
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      const text = await res.text();
      const data = parseRpcBody(text);
      if (!data) return { ok: false, message: "เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON", names: [] };
      if (!res.ok) {
        return { ok: false, message: `เซิร์ฟเวอร์ตอบรหัส ${res.status}`, names: [] };
      }
      const tools = data?.result?.tools || data?.tools || [];
      const names = tools.map((tool) => tool?.name).filter(Boolean);
      if (names.some((name) => /graph/i.test(name))) {
        return {
          ok: false,
          message: "เซิร์ฟเวอร์เปิดกราฟภาพรวม ซึ่งไม่อนุญาต",
          names,
        };
      }
      if (!names.length) {
        return { ok: false, message: "ไม่พบรายชื่อเครื่องมือจากเซิร์ฟเวอร์", names: [] };
      }
      const expected = ["list_posts", "get_post", "list_downloads"];
      const missing = expected.filter((name) => !names.includes(name));
      if (missing.length) {
        return {
          ok: false,
          message: `ยังขาดเครื่องมือ ${missing.join(", ")}`,
          names,
        };
      }
      return { ok: true, message: "เชื่อมต่อได้", names };
    } catch {
      return {
        ok: false,
        message: "เชื่อมต่อ MCP ไม่ได้ เซิร์ฟเวอร์อาจยังไม่ทำงาน หรือถูกบล็อกด้วย CORS",
        names: [],
      };
    }
  }

  async function testLlm() {
    const endpoints = await resolveEndpoints();
    if (!endpoints.ok) return { ok: false, reason: endpoints.reason, text: "" };
    return completeChat(endpoints.llm, [
      { role: "user", content: "ตอบเป็นภาษาไทยหนึ่งประโยคว่าเชื่อมต่อแล้ว" },
    ]);
  }

  function ask(text) {
    const question = String(text ?? document.getElementById("brain-question")?.value ?? "").trim();
    if (!question) return chatQueue;
    chatQueue = chatQueue.then(() => askNow(question)).catch(() => {});
    return chatQueue;
  }

  async function askNow(question) {
    const log = document.getElementById("brain-chat-log");
    const input = document.getElementById("brain-question");
    if (!log) return;
    if (input) input.value = question;
    const empty = document.getElementById("brain-chat-empty");
    if (empty) empty.hidden = true;
    log.querySelectorAll("[data-rag-focus]").forEach((btn) => btn.closest("p")?.remove());
    const turn = document.createElement("article");
    turn.className = "chat-turn";
    turn.innerHTML = `<div class="chat-bubble chat-user">${escapeHtml(question)}</div><div class="chat-bubble chat-assistant"><p class="muted">กำลังค้นหลักฐานแล้วให้โมเดลวิเคราะห์…</p></div>`;
    log.appendChild(turn);
    log.scrollTop = log.scrollHeight;
    if (input) input.value = "";
    const assistant = turn.querySelector(".chat-assistant");
    const dateFrom = document.getElementById("brain-date-from")?.value || "";
    const dateTo = document.getElementById("brain-date-to")?.value || "";
    let result;
    try {
      window.BrainGraph?.setDateWindow?.(dateFrom, dateTo);
      result = await answerQuestion(question, { dateFrom, dateTo });
    } catch (err) {
      assistant.innerHTML = `<p class="rag-warn">ค้นไม่สำเร็จ ${escapeHtml(err?.message || "")}</p>`;
      return;
    }
    lastFocusIds = result.focusIds || [];
    if (lastFocusIds.length) {
      window.BrainGraph?.focusOnIds?.(lastFocusIds);
      const meta = document.getElementById("brain-meta");
      if (meta) {
        const labels = (result.keywords || []).map((item) => item.title).filter(Boolean);
        const note = labels.length ? labels.slice(0, 4).join(", ") : `${lastFocusIds.length} โหนด`;
        meta.textContent = `กรองตามคำถาม · ${note}`;
      }
    } else {
      window.BrainGraph?.clearFocus?.();
    }
    const evidence = renderResult(result, { focus: true });
    assistant.innerHTML = `<details class="rag-evidence" open><summary>หลักฐานจากกราฟ · โหนด ความเชื่อมโยง และข่าวที่เกี่ยวข้อง</summary>${evidence}</details><section class="rag-llm"><p class="brain-kind">ผลจากโมเดล</p><p class="muted">กำลังให้โมเดลเขียนจากหลักฐานด้านบน…</p></section>`;
    assistant.querySelector(".rag-llm")?.scrollIntoView({ block: "nearest" });
    const reply = await askModel(question, result);
    thread.push({ question, result, llmText: reply.ok ? reply.text : "" });
    const analysis = reply.ok
      ? `<div class="rag-narration-body">${renderModelText(reply.text)}</div>`
      : `<p class="rag-warn">${escapeHtml(reply.reason || "เรียกโมเดลไม่สำเร็จ — หลักฐานด้านบนยังใช้ได้")}</p>`;
    assistant.innerHTML = `<details class="rag-evidence"><summary>หลักฐานจากกราฟ · โหนด ความเชื่อมโยง และข่าวที่เกี่ยวข้อง</summary>${evidence}</details><section class="rag-llm"><p class="brain-kind">ผลจากโมเดล</p>${analysis}</section>`;
    assistant.querySelector(".rag-llm")?.scrollIntoView({ block: "nearest" });
  }

  function clearChat() {
    thread.length = 0;
    lastFocusIds = [];
    chatQueue = Promise.resolve();
    const input = document.getElementById("brain-question");
    if (input) input.value = "";
    const log = document.getElementById("brain-chat-log");
    if (log) {
      log.querySelectorAll(".chat-turn").forEach((el) => el.remove());
      const empty = document.getElementById("brain-chat-empty");
      if (empty) empty.hidden = false;
    }
    window.BrainGraph?.clearFocus?.();
  }

  function bindAsk() {
    if (askBound || typeof document === "undefined") return;
    const input = document.getElementById("brain-question");
    const form = document.getElementById("brain-chat-form");
    if (!input && !form) return;
    askBound = true;
    form?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      ask(input?.value || "");
    });
    document.getElementById("brain-chat-clear")?.addEventListener("click", () => clearChat());
    document.querySelectorAll("[data-example]").forEach((btn) => {
      const idx = Number(btn.getAttribute("data-example"));
      const q = EXAMPLES[idx] || btn.textContent || "";
      btn.addEventListener("click", () => {
        if (input) input.value = q;
        ask(q);
      });
    });
    document.getElementById("brain-chat-log")?.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-rag-focus]");
      if (!btn) return;
      window.BrainGraph?.focusOnIds?.(lastFocusIds);
    });
  }

  window.GraphRag = {
    setPosts(list) {
      postsOverride = Array.isArray(list) ? list : [];
      indexCache = null;
    },
    answerQuestion,
    bindAsk,
    clearChat,
    buildIndex,
    answerFromIndex,
  };

  window.NewsConnect = {
    load: loadConnect,
    save: saveConnect,
    resolve: resolveEndpoints,
    testMcp,
    testLlm,
    key: CONNECT_KEY,
    model: LLM_MODEL,
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindAsk);
    else bindAsk();
  }
})();
