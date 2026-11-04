/**
 * In-browser Graph RAG. Retrieval stays in the browser; Gemma only reads that JSON.
 * Attaches window.GraphRag and window.NewsConnect.
 */
(() => {
  const CONNECT_KEY = "police-news-connect";
  const HUB_GROUPS = new Set(["หน่วย", "บุคคล", "สถานที่"]);
  const PERSON_LABELS = new Set(["สั่งการโดย", "เกี่ยวข้องกับบุคคล", "แจ้งโดย", "สืบสวนโดย"]);
  const MEASURE_ORDER = ["เม็ด", "กรัม", "กก.", "กิโลกรัม", "ลิตร", "ล้าน"];
  const TOPIC_GROUPS = [
    { title: "ฆาตกรรม", terms: ["ฆาตกรรม", "คดีฆ่า", "ลงมือฆ่า", "ฆ่า"] },
    { title: "ทำร้ายร่างกาย", terms: ["ทำร้ายร่างกาย", "ทำร้าย"] },
    { title: "ชิงทรัพย์", terms: ["ชิงทรัพย์", "ปล้นทรัพย์", "ปล้น"] },
    { title: "ลักทรัพย์", terms: ["ลักทรัพย์", "โจรกรรม", "ขโมย"] },
    { title: "ข่มขืน", terms: ["ข่มขืนกระทำชำเรา", "ข่มขืน"] },
  ];
  const CRIME_ALIASES = [
    {
      title: "ยาเสพติด",
      phrases: ["คดียาเสพติด", "ยาเสพติด", "สารเสพติด", "ยาบ้า", "ยาไอซ์", "ไอซ์", "เฮโรอีน", "เคตามีน", "กัญชา", "โคเคน", "ยาอี"],
    },
    {
      title: "อาชญากรรมไซเบอร์และออนไลน์",
      phrases: ["อาชญากรรมไซเบอร์", "มิจฉาชีพออนไลน์", "คอลเซ็นเตอร์", "แก๊งคอล", "สแกมเมอร์", "ไซเบอร์"],
    },
    {
      title: "พนันและบ่อนผิดกฎหมาย",
      phrases: ["พนันออนไลน์", "เว็บพนัน", "บ่อนการพนัน", "การพนัน", "บ่อน"],
    },
    {
      title: "ค้ามนุษย์ แรงงานผิดกฎหมาย และคุ้มครองเด็ก",
      phrases: ["ค้ามนุษย์", "แรงงานเถื่อน", "ลักลอบแรงงาน", "คุ้มครองเด็ก"],
    },
    {
      title: "คดีเศรษฐกิจ การเงิน และฟอกเงิน",
      phrases: ["ฟอกเงิน", "บัญชีม้า", "หลอกลงทุน", "ฉ้อโกง"],
    },
    {
      title: "ทุจริตและประพฤติมิชอบของเจ้าหน้าที่รัฐ",
      phrases: ["ประพฤติมิชอบ", "ทุจริต"],
    },
    {
      title: "สิ่งแวดล้อม ทรัพยากร และสัตว์ป่า",
      phrases: ["สัตว์ป่า", "งาช้าง", "ทรัพยากรธรรมชาติ"],
    },
    {
      title: "อาชญากรรมที่เกี่ยวข้องกับนักท่องเที่ยวและชาวต่างชาติ",
      phrases: ["นักท่องเที่ยว", "ชาวต่างชาติ"],
    },
    {
      title: "คดีอุกฉกรรจ์ ผู้มีอิทธิพล และอาวุธ",
      phrases: ["ผู้มีอิทธิพล", "อาวุธปืน", "อาวุธเถื่อน"],
    },
    {
      title: "คดีทรัพย์สิน",
      phrases: ["คดีทรัพย์สิน", "ทรัพย์สิน"],
    },
  ];
  const POSITION_ALIASES = [
    { title: "ผู้ช่วย ผบ.ตร.", phrases: ["ผู้ช่วยผู้บัญชาการตำรวจแห่งชาติ", "ผู้ช่วย ผบ.ตร.", "ผช.ผบ.ตร."] },
    { title: "รอง ผบ.ตร.", phrases: ["รองผู้บัญชาการตำรวจแห่งชาติ", "รอง ผบ.ตร."] },
    { title: "ผบ.ตร.", phrases: ["ผู้บัญชาการตำรวจแห่งชาติ", "ผบ.ตร."] },
  ];
  const SPAN_GUARDS = [
    "แพร่ระบาด",
    "การแพร่ระบาด",
    "แพร่กระจาย",
    "แพร่เชื้อ",
    "แพร่หลาย",
    "แพร่ภาพ",
    "แพร่ข่าว",
    "แพร่พันธุ์",
    "ร่วมฉลอง",
    "พิธีฉลอง",
    "ฉลองชัย",
    "ฉลองปีใหม่",
    "งานฉลอง",
    "นาแก้ว",
  ];
  const LLM_MODEL = "google/gemma-4-e2b";
  const NARRATION_RULE =
    "คุณตอบภาษาไทยจาก JSON ที่ส่งมาเท่านั้น ห้ามใช้ความรู้ภายนอก ห้ามเรียกเครื่องมือ และห้ามแต่งชื่อ คน ตำแหน่ง หรือตัวเลขที่ไม่มีใน JSON เล่าและนับเฉพาะ evidence ถ้า relatedThroughNodes ว่างห้ามเล่าข่าวอื่น ถ้าคำถามระบุตำแหน่ง ให้ยึด selectedFacets.positions กับ hubs ของตำแหน่งนั้น ห้ามขยายเป็นข่าวทั้งหน่วยงานแม่ ถ้ามี holder ให้บอกชื่อและตำแหน่งจาก holder เท่านั้น ถ้าไม่มีหลักฐานของคนหรือตำแหน่งที่ถามให้บอกว่าไม่มีในคลัง ถ้าถามว่าเกิดขึ้นที่ไหน ให้ใช้ places ใน evidence เท่านั้น ห้ามตีคำธรรมดาเป็นจังหวัดเมื่อไม่อยู่ใน selectedFacets ห้ามรวมหน่วยนับที่ต่างกัน";

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
      .replaceAll("\u200b", "")
      .replaceAll("\u200c", "")
      .replaceAll("\u200d", "")
      .replaceAll("\ufeff", "")
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
    const s = String(raw ?? "").trim().replaceAll(",", "");
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
      return n.length >= 3 && q.includes(n);
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

  function indexPosts(posts) {
    const postsById = new Map();
    for (const post of posts || []) {
      if (post?.id) postsById.set(String(post.id), post);
      if (post?.slug) postsById.set(String(post.slug), post);
    }
    return postsById;
  }

  function crimeTypeTitles(nodes) {
    return [
      ...new Set(
        nodes
          .filter((n) => n.kind === "crime_type" && n.title)
          .map((n) => n.title)
          .concat(nodes.filter((n) => n.kind === "case" && n.crime_type).map((n) => n.crime_type))
      ),
    ];
  }

  function isParentMember(node, title, token) {
    if (node.kind !== "entity") return false;
    const text = norm(node.title);
    if (title && text === title) return true;
    return Boolean(token) && text.includes(token);
  }

  function parentHub(nodes, rule, alias) {
    const title = norm(rule.title || "");
    const token = norm(rule.contains || "");
    const members = nodes.filter((node) => isParentMember(node, title, token));
    const exact = members
      .filter((node) => norm(node.title) === title)
      .sort((a, b) => (b.degree || 0) - (a.degree || 0));
    const real = exact[0] || null;
    const id = real?.id || rule.virtual_id || `hub:${rule.title || members.length}`;
    return {
      key: id,
      id,
      title: rule.title || real?.title || "",
      entity_group: rule.entity_group || real?.entity_group || "หน่วย",
      virtual: !real,
      memberIds: members.map((node) => node.id),
      roleWarning: roleWarningFor(rule.title || "", alias),
      position: real?.position || "",
      current_holder: real?.current_holder || "",
    };
  }

  function indexParents(nodes, alias) {
    const parents = [];
    const entityParent = new Map();
    for (const rule of alias?.parents || []) {
      const hub = parentHub(nodes, rule, alias);
      parents.push(hub);
      for (const id of hub.memberIds) {
        if (!entityParent.has(id)) entityParent.set(id, hub);
      }
    }
    return { parents, entityParent };
  }

  function collectPositions(node, seenPos, positionTitles) {
    for (const seg of positionSegments(node.position)) {
      const key = norm(seg);
      if (!key || seenPos.has(key)) continue;
      seenPos.add(key);
      positionTitles.push(seg);
    }
  }

  function indexPositions(nodes) {
    const positionTitles = [];
    const seenPos = new Set();
    for (const node of nodes) collectPositions(node, seenPos, positionTitles);
    return positionTitles;
  }

  function rememberPlace(map, nodesById, caseId, otherId) {
    const caseNode = nodesById.get(caseId);
    const place = nodesById.get(otherId);
    if (caseNode?.kind !== "case" || place?.kind !== "entity" || place.entity_group !== "สถานที่") return;
    const list = map.get(caseId) || [];
    if (!list.includes(place.title)) list.push(place.title);
    map.set(caseId, list);
  }

  function placesByCase(nodesById, edges) {
    const map = new Map();
    for (const edge of edges || []) {
      rememberPlace(map, nodesById, edge.source, edge.target);
      rememberPlace(map, nodesById, edge.target, edge.source);
    }
    return map;
  }

  function buildIndex(graph, posts, alias) {
    const nodes = graph?.nodes || [];
    const edges = graph?.edges || [];
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    const { parents, entityParent } = indexParents(nodes, alias);
    return {
      nodesById,
      casesById: new Map(nodes.filter((n) => n.kind === "case").map((n) => [n.id, n])),
      postsById: indexPosts(posts),
      edges,
      crimeTypes: crimeTypeTitles(nodes),
      parents,
      entityParent,
      hubEntities: nodes.filter((n) => n.kind === "entity" && HUB_GROUPS.has(n.entity_group)),
      positionTitles: indexPositions(nodes),
      placeTitlesByCase: placesByCase(nodesById, edges),
      alias: alias || {},
    };
  }

  function claimPool(qn, candidates) {
    candidates.sort((a, b) => b.len - a.len || (a.rank ?? 9) - (b.rank ?? 9));
    const hits = [];
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
          const dedupe = `${item.kind}:${norm(item.title)}`;
          if (!seen.has(dedupe)) {
            seen.add(dedupe);
            hits.push({ kind: item.kind, facet: item.facet, title: item.title, start: at, end });
          }
          break;
        }
        from = at + 1;
      }
    }
    return hits;
  }

  function withoutNestedSpans(items) {
    return items.filter(
      (item) =>
        !items.some(
          (other) =>
            other !== item &&
            item.start >= other.start &&
            item.end <= other.end &&
            other.end - other.start > item.end - item.start
        )
    );
  }

  function facetLabels(facets) {
    if (!facets) return [];
    return [
      ...(facets.places || []),
      ...(facets.orgs || []),
      ...(facets.people || []),
      ...(facets.positions || []),
      ...(facets.crimes || []),
      ...(facets.topics || []),
    ];
  }

  function pushCandidate(bucket, kind, facet, title, minLen, extra = {}) {
    const text = String(extra.display || title || "").trim();
    const key = norm(extra.key != null ? extra.key : text);
    if (!text || key.length < minLen) return;
    bucket.push({ kind, facet, title: text, key, len: key.length, rank: extra.rank ?? 5 });
  }

  function addEntityCandidate(place, org, person, ent) {
    if (ent.entity_group === "สถานที่") {
      pushCandidate(place, "place", "places", ent.title, 3);
      return;
    }
    if (ent.entity_group === "หน่วย") {
      pushCandidate(org, "org", "orgs", ent.title, 3, { rank: 2 });
      return;
    }
    if (ent.entity_group !== "บุคคล") return;
    pushCandidate(person, "person", "people", ent.title, 3, { rank: 1 });
    if (ent.current_holder) pushCandidate(person, "holder", "people", ent.current_holder, 3, { rank: 2 });
  }

  function addParentCandidate(org, parent, index) {
    pushCandidate(org, "org", "orgs", parent.title, 2, { rank: 1 });
    const rule = (index.alias.parents || []).find((item) => (item.title || "") === parent.title) || {};
    if (!rule.contains) return;
    pushCandidate(org, "org", "orgs", parent.title, 3, { key: rule.contains, display: parent.title, rank: 1 });
  }

  function addAliasPhrases(bucket, aliases, kind, facet) {
    for (const alias of aliases) {
      for (const phrase of alias.phrases) {
        pushCandidate(bucket, kind, facet, alias.title, 2, { key: phrase, display: alias.title, rank: 0 });
      }
    }
  }

  function keywordBuckets(index) {
    const place = [];
    const org = [];
    const person = [];
    const crime = [];
    for (const ent of index.hubEntities || []) addEntityCandidate(place, org, person, ent);
    for (const parent of index.parents || []) addParentCandidate(org, parent, index);
    for (const title of index.positionTitles || []) pushCandidate(person, "position", "positions", title, 2, { rank: 0 });
    addAliasPhrases(person, POSITION_ALIASES, "position", "positions");
    for (const title of index.crimeTypes || []) pushCandidate(crime, "crime", "crimes", title, 3);
    addAliasPhrases(crime, CRIME_ALIASES, "crime", "crimes");
    const topics = [];
    for (const group of TOPIC_GROUPS) {
      for (const term of group.terms) {
        pushCandidate(topics, "topic", "topics", group.title, 2, { key: term, display: group.title, rank: 0 });
      }
    }
    return { place, org, person, crime, topics };
  }

  function titlesFor(items, facet) {
    return items.filter((item) => item.facet === facet).map((item) => item.title);
  }

  function facetsFrom(claimed) {
    return {
      places: titlesFor(claimed, "places"),
      orgs: titlesFor(claimed, "orgs"),
      people: titlesFor(claimed, "people"),
      crimes: titlesFor(claimed, "crimes"),
      positions: titlesFor(claimed, "positions"),
      topics: titlesFor(claimed, "topics"),
    };
  }

  function addCrimeFallback(claimed, selectedFacets, crimeHits, aliased, index) {
    if (crimeHits.length || selectedFacets.crimes.length) return;
    for (const title of detectCrimeTypes(aliased, index.crimeTypes)) {
      claimed.push({ kind: "crime", facet: "crimes", title });
      selectedFacets.crimes.push(title);
    }
  }

  function guardCandidates() {
    return SPAN_GUARDS.map((phrase) => {
      const key = norm(phrase);
      return { kind: "guard", facet: "guards", title: phrase, key, len: key.length, rank: 0 };
    });
  }

  function extractKeywords(question, index) {
    const aliased = applyTitleAliases(question, index.alias);
    const qn = norm(aliased);
    const buckets = keywordBuckets(index);
    const crimeHits = claimPool(qn, buckets.crime);
    const claimed = withoutNestedSpans([
      ...claimPool(qn, guardCandidates()),
      ...claimPool(qn, buckets.place),
      ...claimPool(qn, buckets.org),
      ...claimPool(qn, buckets.person),
      ...crimeHits,
      ...claimPool(qn, buckets.topics),
    ])
      .filter((item) => item.kind !== "guard")
      .map(({ kind, facet, title }) => ({ kind, facet, title }));
    const selectedFacets = facetsFrom(claimed);
    addCrimeFallback(claimed, selectedFacets, crimeHits, aliased, index);
    return {
      aliased,
      qn,
      keywords: claimed,
      selectedFacets,
      positionHits: selectedFacets.positions,
    };
  }

  function wantedSet(keys, kind) {
    return new Set(keys.filter((item) => item.kind === kind).map((item) => norm(item.title)));
  }

  function absorbMembers(hubs) {
    const absorbed = new Set();
    for (const hub of hubs) {
      for (const id of hub.memberIds) absorbed.add(id);
    }
    return absorbed;
  }

  function entityHits(ent, wanted) {
    const titleKey = norm(ent.title);
    const hitPlace = ent.entity_group === "สถานที่" && wanted.place.has(titleKey);
    const hitOrg = ent.entity_group === "หน่วย" && wanted.org.has(titleKey);
    const hitPerson = ent.entity_group === "บุคคล" && wanted.person.has(titleKey);
    return {
      titleKey,
      hitPlace,
      hitOrg,
      hitPerson,
      hitTitle: Boolean(hitPlace || hitOrg || hitPerson),
      hitHolder: Boolean(ent.current_holder) && wanted.holder.has(norm(ent.current_holder)),
      hitPos: positionSegments(ent.position).some((seg) => wanted.pos.has(norm(seg))),
      hitOffice: wanted.pos.has(titleKey),
    };
  }

  function entityFacet(hit) {
    if (hit.hitPlace) return "places";
    if (hit.hitPerson || hit.hitHolder) return "people";
    if (hit.hitOffice) return "positions";
    if (hit.hitPos && !hit.hitOrg) return "positions";
    return "orgs";
  }

  function matchedBy(hit) {
    if (hit.hitHolder) return "holder";
    if (hit.hitOffice || (hit.hitPos && !hit.hitTitle)) return "position";
    return "title";
  }

  function coveredByLongerHub(hubs, titleKey, hitTitle) {
    if (!hitTitle) return false;
    return hubs.some((hub) => {
      const hubTitle = norm(hub.title);
      return hubTitle.includes(titleKey) && hubTitle !== titleKey;
    });
  }

  function pushMatchedEntity(hubs, ent, hit, index) {
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
      matchedBy: matchedBy(hit),
      facet: entityFacet(hit),
    });
  }

  function addEntityHub(hubs, ent, wanted, absorbed, seen, index) {
    const hit = entityHits(ent, wanted);
    if (!hit.hitTitle && !hit.hitHolder && !hit.hitPos && !hit.hitOffice) return;
    if (absorbed.has(ent.id) || seen.has(ent.id)) return;
    if (coveredByLongerHub(hubs, hit.titleKey, hit.hitTitle)) return;
    seen.add(ent.id);
    pushMatchedEntity(hubs, ent, hit, index);
    absorbed.add(ent.id);
  }

  function matchHubs(question, index, keywords) {
    const keys = keywords || extractKeywords(question, index).keywords;
    const hubs = [];
    const seen = new Set();
    const wanted = {
      org: wantedSet(keys, "org"),
      place: wantedSet(keys, "place"),
      person: wantedSet(keys, "person"),
      holder: wantedSet(keys, "holder"),
      pos: wantedSet(keys, "position"),
    };
    for (const parent of index.parents) {
      if (!wanted.org.has(norm(parent.title)) || seen.has(parent.key)) continue;
      seen.add(parent.key);
      hubs.push({ ...parent, facet: "orgs" });
    }
    const absorbed = absorbMembers(hubs);
    const entities = index.hubEntities.slice().sort((a, b) => norm(b.title).length - norm(a.title).length);
    for (const ent of entities) addEntityHub(hubs, ent, wanted, absorbed, seen, index);
    hubs._keywords = keys;
    return hubs;
  }

  function otherEnd(edge, id) {
    if (edge.source === id) return edge.target;
    if (edge.target === id) return edge.source;
    return "";
  }

  function focusable(node) {
    if (!node) return false;
    if (node.kind === "crime_type") return true;
    return node.kind === "entity" && HUB_GROUPS.has(node.entity_group);
  }

  function expandFrom(id, index, out, added, maxExtra) {
    if (added >= maxExtra) return added;
    for (const edge of index.edges || []) {
      if (added >= maxExtra) break;
      const other = otherEnd(edge, id);
      if (!other || out.has(other)) continue;
      if (!focusable(index.nodesById.get(other))) continue;
      out.add(other);
      added += 1;
    }
    return added;
  }

  function expandFocusIds(ids, index, opts = {}) {
    const seed = new Set((ids || []).filter(Boolean));
    const out = new Set(seed);
    const maxExtra = Number.isFinite(opts.maxExtra) ? opts.maxExtra : 40;
    let added = 0;
    for (const id of seed) {
      added = expandFrom(id, index, out, added, maxExtra);
      if (added >= maxExtra) break;
    }
    return [...out];
  }

  function edgeCaseLink(edge, members) {
    if (members.has(edge.source)) return { entId: edge.source, caseId: edge.target };
    if (members.has(edge.target)) return { entId: edge.target, caseId: edge.source };
    return null;
  }

  function caseDates(node, index) {
    const postId = node.case_id || String(node.id).replace(/^20_Cases\//, "");
    const post = index.postsById.get(String(postId)) || null;
    const routeDate = post?._date || node.date || "";
    return { post, postId: String(postId), routeDate, filterDate: node.date || routeDate };
  }

  function skippedByWindow(filterDate, opts) {
    if (!opts.applyWindow || (!opts.dateFrom && !opts.dateTo)) return false;
    if (!filterDate) return true;
    if (opts.dateFrom && filterDate < opts.dateFrom) return true;
    return Boolean(opts.dateTo && filterDate > opts.dateTo);
  }

  function blockedCase(node, dates, opts, label) {
    if (opts.personEdges && !PERSON_LABELS.has(label)) return true;
    if (opts.applyCrime && opts.crimeTypes?.length && !opts.crimeTypes.includes(node.crime_type || "")) return true;
    return skippedByWindow(dates.filterDate, opts);
  }

  function ensureCaseRow(found, node, dates) {
    if (!found.has(node.id)) {
      found.set(node.id, {
        node,
        post: dates.post,
        postId: dates.postId,
        routeDate: dates.routeDate,
        filterDate: dates.filterDate,
        labels: new Set(),
        via: new Set(),
      });
    }
    return found.get(node.id);
  }

  function linkedCases(hub, index, opts) {
    const members = new Set(hub.memberIds);
    const found = new Map();
    for (const edge of index.edges) {
      const link = edgeCaseLink(edge, members);
      if (!link) continue;
      const node = index.casesById.get(link.caseId);
      if (!node) continue;
      const label = String(edge.label || "").trim();
      const dates = caseDates(node, index);
      if (blockedCase(node, dates, opts, label)) continue;
      const row = ensureCaseRow(found, node, dates);
      if (label) row.labels.add(label);
      row.via.add(link.entId);
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

  function intersectRows(lists) {
    const usable = (lists || []).filter(Boolean);
    if (!usable.length) return [];
    let current = usable[0];
    for (let i = 1; i < usable.length; i += 1) {
      const other = new Map(usable[i].map((row) => [row.node.id, row]));
      const next = [];
      for (const row of current) {
        const hit = other.get(row.node.id);
        if (!hit) continue;
        for (const label of hit.labels) row.labels.add(label);
        for (const via of hit.via) row.via.add(via);
        next.push(row);
      }
      current = next;
    }
    return current;
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
      places: (index.placeTitlesByCase.get(row.node.id) || []).slice(0, 4),
      labels: [...row.labels],
      org: orgNames(row, index, canonicalTitle),
      position: row.node.position || "",
    };
  }

  const QTY_UNITS = ["กิโลกรัม", "กรัม", "กก.", "กก", "เม็ด", "ลิตร"];

  function isDigit(ch) {
    return ch >= "0" && ch <= "9";
  }

  function skipSpaces(src, index) {
    let i = index;
    while (src[i] === " " || src[i] === "\t" || src[i] === "\n" || src[i] === "\r") i += 1;
    return i;
  }

  function readQuantityNumber(src, start) {
    let i = start;
    let sawDigit = false;
    let sawDot = false;
    while (i < src.length) {
      const ch = src[i];
      if (isDigit(ch)) {
        sawDigit = true;
        i += 1;
      } else if (ch === "," && sawDigit) {
        i += 1;
      } else if (ch === "." && sawDigit && !sawDot) {
        sawDot = true;
        i += 1;
      } else break;
    }
    if (!sawDigit) return null;
    return { raw: src.slice(start, i), end: i };
  }

  function matchUnit(src, index) {
    for (const unit of QTY_UNITS) {
      if (src.startsWith(unit, index)) return unit;
    }
    return "";
  }

  function squeeze(text) {
    return String(text || "").split(/\s+/).join(" ").trim();
  }

  function pushQuantity(hits, spans, hit) {
    hits.push(hit);
    spans.push(hit.span);
  }

  function quantityFrom(src, start) {
    const num = readQuantityNumber(src, start);
    if (!num) return null;
    let cursor = skipSpaces(src, num.end);
    let million = false;
    if (src.startsWith("ล้าน", cursor)) {
      million = true;
      cursor = skipSpaces(src, cursor + "ล้าน".length);
    }
    const unit = matchUnit(src, cursor);
    if (!unit) return { end: num.end };
    const base = parseNum(num.raw);
    if (base == null) return { end: num.end };
    const displayEnd = cursor + unit.length;
    return {
      end: displayEnd,
      hit: {
        unit: unit === "กก" ? "กก." : unit,
        value: million ? base * 1000000 : base,
        display: squeeze(src.slice(start, displayEnd)),
        span: [start, displayEnd],
      },
    };
  }

  function bareMillion(src, start, spans) {
    const num = readQuantityNumber(src, start);
    if (!num) return start + 1;
    const cursor = skipSpaces(src, num.end);
    if (!src.startsWith("ล้าน", cursor)) return num.end;
    const end = cursor + "ล้าน".length;
    if (spans.some(([a, b]) => start < b && end > a)) return end;
    const base = parseNum(num.raw);
    if (base == null) return end;
    return {
      end,
      hit: {
        unit: "ล้าน",
        value: base,
        display: squeeze(src.slice(start, end)),
        span: [start, end],
      },
    };
  }

  function extractQuantities(text) {
    const src = String(text || "");
    const hits = [];
    const spans = [];
    let i = 0;
    while (i < src.length) {
      if (!isDigit(src[i])) {
        i += 1;
        continue;
      }
      const found = quantityFrom(src, i);
      if (found?.hit) pushQuantity(hits, spans, found.hit);
      i = found?.end || i + 1;
    }
    i = 0;
    while (i < src.length) {
      if (!isDigit(src[i])) {
        i += 1;
        continue;
      }
      const found = bareMillion(src, i, spans);
      if (typeof found === "object" && found.hit) hits.push(found.hit);
      i = typeof found === "number" ? found : found.end;
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
      keywords: extra?.keywords || [],
      selectedFacets: extra?.selectedFacets || {
        places: [],
        orgs: [],
        people: [],
        crimes: [],
        positions: [],
        topics: [],
      },
      filterMode: "single",
    };
  }

  function rowsCarrying(index, opts, predicate) {
    const rows = [];
    for (const node of index.casesById.values()) {
      if (!predicate(node)) continue;
      const dates = caseDates(node, index);
      if (blockedCase(node, dates, opts, "")) continue;
      rows.push({
        node,
        post: dates.post,
        postId: dates.postId,
        routeDate: dates.routeDate,
        filterDate: dates.filterDate,
        labels: new Set(),
        via: new Set(),
      });
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

  function carriesTitle(node, want) {
    return positionSegments(node.position).some((seg) => norm(seg) === want);
  }

  function holderOrg(nodes, carries) {
    const withHolder = nodes.find(
      (node) => node.kind === "entity" && node.entity_group === "หน่วย" && node.current_holder && carries(node)
    );
    if (withHolder) return withHolder;
    return nodes.find((node) => node.kind === "entity" && node.entity_group === "หน่วย" && carries(node)) || null;
  }

  function firstOrgTitle(person) {
    return String(person?.position_org || "")
      .split(" · ")
      .map((part) => part.trim())
      .find(Boolean) || "";
  }

  function holderForTitle(title, index) {
    const want = norm(title);
    const nodes = [...index.nodesById.values()];
    const carries = (node) => carriesTitle(node, want);
    const person = nodes.find((node) => node.kind === "entity" && node.entity_group === "บุคคล" && carries(node));
    const org = holderOrg(nodes, carries);
    const name = String(org?.current_holder || person?.title || "").trim();
    if (!name) return null;
    return {
      title,
      name,
      org: org?.title || firstOrgTitle(person),
      orgId: org?.id || "",
      personId: person?.id || "",
    };
  }

  function facetForGroup(group) {
    if (group === "สถานที่") return "places";
    if (group === "บุคคล") return "people";
    return "orgs";
  }

  function pushNodeHub(hubs, node, index, facet) {
    if (!node) return;
    if (hubs.some((hub) => hub.id === node.id || hub.memberIds?.includes(node.id))) return;
    const groupFacet = facetForGroup(node.entity_group);
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
      facet: facet || groupFacet,
    });
  }

  function rowsForHubList(hubList, index, opts) {
    const lists = [];
    for (const hub of hubList) {
      lists.push(
        linkedCases(hub, index, { ...opts, personEdges: usesPersonEdges(hub) }),
        rowsForHubPosition(hub, index, opts)
      );
    }
    return mergeRows(lists);
  }

  function sharedRoleWarning(title) {
    return `โหนด «${title}» เป็นตำแหน่งหรือบทบาทที่ใช้ร่วมกัน ไม่ใช่บุคคลคนเดียวที่ระบุตัวตนได้`;
  }

  function virtualPositionHub(title) {
    return {
      key: `position:${title}`,
      id: `position:${title}`,
      title,
      entity_group: "บุคคล",
      virtual: true,
      memberIds: [],
      roleWarning: true,
      position: title,
      current_holder: "",
      facet: "positions",
    };
  }

  function attachHolders(hubs, positions, index) {
    const holderHits = [];
    for (const title of positions) rememberHolder(hubs, holderHits, title, index);
    for (const title of positions) rememberLoosePosition(hubs, holderHits, title);
    const loose = positions.filter((title) => !holderHits.some((hit) => norm(hit.title) === norm(title)));
    return { holderHits, loose };
  }

  function rememberHolder(hubs, holderHits, title, index) {
    const info = holderForTitle(title, index);
    if (!info) return;
    holderHits.push(info);
    pushNodeHub(hubs, index.nodesById.get(info.orgId), index, "people");
    pushNodeHub(hubs, index.nodesById.get(info.personId), index, "people");
  }

  function rememberLoosePosition(hubs, holderHits, title) {
    if (holderHits.some((hit) => norm(hit.title) === norm(title))) return;
    if (hubs.some((hub) => norm(hub.title) === norm(title))) return;
    hubs.push(virtualPositionHub(title));
  }

  function topicByTitle(title) {
    return TOPIC_GROUPS.find((group) => group.title === title) || { title, terms: [title] };
  }

  function caseMentionsTopic(node, topic) {
    const hay = norm(`${node.title || ""} ${node.excerpt || ""} ${node.crime_type || ""}`);
    return topic.terms.some((term) => hay.includes(norm(term)));
  }

  function rowsForTopics(index, titles, opts) {
    const groups = titles.map(topicByTitle);
    return rowsCarrying(index, opts, (node) => groups.every((group) => caseMentionsTopic(node, group)));
  }

  function facetCountOf(selectedFacets, crimeTypes) {
    const personFacet = Boolean(selectedFacets.people.length || selectedFacets.positions.length);
    const count = [
      selectedFacets.places.length,
      selectedFacets.orgs.length,
      personFacet ? 1 : 0,
      crimeTypes.length,
      (selectedFacets.topics || []).length,
    ].filter(Boolean).length;
    return { personFacet, count, filterMode: count > 1 ? "and" : "single" };
  }

  function personRows(hubs, index, loose, dated) {
    const personLists = [
      rowsForHubList(
        hubs.filter((hub) => hub.facet === "people" || hub.facet === "positions"),
        index,
        dated
      ),
    ];
    for (const title of loose) personLists.push(rowsForExactPosition(title, index, dated));
    return mergeRows(personLists);
  }

  function evidenceSets(hubs, index, loose, selectedFacets, crimeTypes, personFacet, dated) {
    const sets = [];
    if (selectedFacets.places.length) {
      sets.push(rowsForHubList(hubs.filter((hub) => hub.facet === "places"), index, dated));
    }
    if (selectedFacets.orgs.length) {
      sets.push(rowsForHubList(hubs.filter((hub) => hub.facet === "orgs"), index, dated));
    }
    if (personFacet) sets.push(personRows(hubs, index, loose, dated));
    if (crimeTypes.length) {
      sets.push(rowsCarrying(index, { ...dated, crimeTypes, applyCrime: true }, () => true));
    }
    if ((selectedFacets.topics || []).length) sets.push(rowsForTopics(index, selectedFacets.topics, dated));
    return sets;
  }

  function olderRows(filterMode, crimeTypes, topics, hubs, index, loose, evidenceRows) {
    if (filterMode !== "single" || crimeTypes.length || topics.length) return [];
    const open = { applyCrime: false, applyWindow: false };
    const evidenceIds = new Set(evidenceRows.map((row) => row.node.id));
    return sortRows(
      mergeRows([
        rowsForHubList(hubs, index, open),
        ...loose.map((title) => rowsForExactPosition(title, index, open)),
      ]).filter((row) => !evidenceIds.has(row.node.id)),
      "list"
    );
  }

  function decorateRows(rows, index, canonicalTitle) {
    return rows.map((row) => {
      const item = toEvidence(row, index, canonicalTitle);
      row.org = item.org;
      row.title = item.title;
      row.date = item.date;
      row.href = item.href;
      return item;
    });
  }

  function addWarning(warnings, seen, text) {
    if (!text || seen.has(text)) return;
    seen.add(text);
    warnings.push(text);
  }

  function collectWarnings(hubs, loose) {
    const warnings = [];
    const seen = new Set();
    for (const hub of hubs) {
      if (hub.roleWarning) addWarning(warnings, seen, sharedRoleWarning(hub.title));
    }
    for (const title of loose) addWarning(warnings, seen, sharedRoleWarning(title));
    return warnings;
  }

  function crimeNodeId(index, title) {
    const crimeNode = [...index.nodesById.values()].find(
      (node) => node.kind === "crime_type" && norm(node.title) === norm(title)
    );
    return crimeNode?.id || "";
  }

  function pushHubFocus(push, hub) {
    if (!hub.virtual) push(hub.id);
    for (const id of hub.memberIds) push(id);
  }

  function focusIdsFor(index, hubs, evidenceRows, oldRows, crimeTypes, keepOld) {
    const focusIds = [];
    const seen = new Set();
    const push = (id) => {
      if (!id || seen.has(id) || !index.nodesById.has(id)) return;
      seen.add(id);
      focusIds.push(id);
    };
    for (const hub of hubs) pushHubFocus(push, hub);
    for (const row of evidenceRows) push(row.node.id);
    if (keepOld) {
      for (const row of oldRows) push(row.node.id);
    }
    for (const title of crimeTypes) push(crimeNodeId(index, title));
    if (!keepOld) return focusIds;
    return expandFocusIds(focusIds, index);
  }

  function linkedVia(item, oldRows, memberIds) {
    const row = oldRows.find((entry) => entry.node.id === item.nodeId);
    if (!row) return false;
    for (const via of row.via) {
      if (memberIds.has(via)) return true;
    }
    return false;
  }

  function slimCase(item) {
    return {
      id: item.id,
      date: item.date,
      title: item.title,
      href: item.href,
      crime_type: item.crime_type,
    };
  }

  function oldLinkGroup(hub, oldEvidence, oldRows) {
    const memberIds = new Set(hub.memberIds);
    const cases = oldEvidence.filter((item) => linkedVia(item, oldRows, memberIds)).map(slimCase);
    return {
      hubTitle: hub.title,
      entityGroup: hub.entity_group,
      relation: shareRelation(hub.entity_group),
      cases,
    };
  }

  function oldLinksFor(hubs, oldEvidence, oldRows) {
    return hubs.map((hub) => oldLinkGroup(hub, oldEvidence, oldRows)).filter((group) => group.cases.length);
  }

  function windowNoteFor(dateFrom, dateTo) {
    if (!dateFrom && !dateTo) return "ทุกวันที่ในคลัง";
    return `${dateFrom || "…"} ถึง ${dateTo || "…"}`;
  }

  function officeNews(holder, count) {
    if (holder.org) return ` และมีข่าวของ ${holder.org} ${count} ข่าว`;
    return ` และมีข่าวที่เชื่อมในกราฟ ${count} ข่าว`;
  }

  function answerMessage(ctx) {
    const matched = ctx.filterMode === "and" ? "ตรงทุกเงื่อนไข" : "ตรงเงื่อนไข";
    if (ctx.intent === "office" && ctx.primaryHolder) return officeMessage(ctx, matched);
    if (!ctx.evidence.length) return `พบ ${ctx.names} แต่ไม่มีข่าวที่${matched}ในช่วง ${ctx.windowNote}`;
    if (ctx.intent === "count") return countMessage(ctx, matched);
    if (ctx.intent === "timeline") return listMessage(ctx, matched, "ลำดับข่าวที่");
    return listMessage(ctx, matched, "รายการข่าวที่");
  }

  function officeMessage(ctx, matched) {
    let message = `${ctx.primaryHolder.name} ดำรงตำแหน่ง${ctx.primaryHolder.title}`;
    if (ctx.evidence.length) message += officeNews(ctx.primaryHolder, ctx.evidence.length);
    if (ctx.filterMode === "and") message += ` · ${matched} ${ctx.names}`;
    return message;
  }

  function countMessage(ctx, matched) {
    if (ctx.filterMode === "and") return `พบ ${ctx.evidence.length} ข่าวที่${matched} (${ctx.names})`;
    return `พบ ${ctx.evidence.length} ข่าวที่เชื่อมกับ ${ctx.names}`;
  }

  function listMessage(ctx, matched, prefix) {
    if (ctx.filterMode === "and") return `${prefix}${matched} (${ctx.names}) จำนวน ${ctx.evidence.length} ข่าว`;
    return `${prefix}เชื่อมกับ ${ctx.names} จำนวน ${ctx.evidence.length} ข่าว`;
  }

  function publicHub(hub, index) {
    const node = index.nodesById.get(hub.id);
    return {
      id: hub.id,
      title: hub.title,
      entity_group: hub.entity_group,
      virtual: hub.virtual,
      roleWarning: hub.roleWarning,
      position: hub.position || node?.position || "",
      current_holder: hub.current_holder || node?.current_holder || "",
    };
  }

  function holderSummary(primaryHolder) {
    if (!primaryHolder) return null;
    return { name: primaryHolder.name, position: primaryHolder.title, org: primaryHolder.org };
  }

  function answerFromIndex(index, text, opts = {}) {
    const question = String(text || "").trim();
    const dateFrom = opts.dateFrom || "";
    const dateTo = opts.dateTo || "";
    const intent = detectIntent(question);
    if (!question) return emptyResult("ยังไม่มีคำถาม จึงไม่รายงานจำนวน", { intent, dateFrom, dateTo });
    const extracted = extractKeywords(question, index);
    const selectedFacets = extracted.selectedFacets;
    const keywords = extracted.keywords || [];
    const crimeTypes = selectedFacets.crimes.slice();
    const positions = extracted.positionHits || mentionedPositions(extracted.aliased, index.positionTitles || []);
    const hubs = matchHubs(question, index, keywords);
    const attached = attachHolders(hubs, positions, index);
    const facets = facetCountOf(selectedFacets, crimeTypes);
    if (!facets.count) {
      return emptyResult("ไม่พบหน่วยงาน บุคคล สถานที่ หรือประเภทคดีในคลังที่ตรงกับคำถามนี้ จึงไม่รายงานจำนวน", {
        intent,
        crimeTypes,
        dateFrom,
        dateTo,
        keywords,
        selectedFacets,
      });
    }
    const dated = { dateFrom, dateTo, applyCrime: false, applyWindow: true };
    const evidenceRows = sortRows(
      intersectRows(evidenceSets(hubs, index, attached.loose, selectedFacets, crimeTypes, facets.personFacet, dated)),
      intent
    );
    const topics = selectedFacets.topics || [];
    const oldRows = olderRows(facets.filterMode, crimeTypes, topics, hubs, index, attached.loose, evidenceRows);
    const canonicalTitle = hubs.length === 1 ? hubs[0].title : "";
    const evidence = decorateRows(evidenceRows, index, canonicalTitle);
    const oldEvidence = oldRows.map((row) => toEvidence(row, index, canonicalTitle));
    const keepOld = facets.filterMode === "single" && !crimeTypes.length && !topics.length;
    const names = facetLabels(selectedFacets).join(" · ");
    const primaryHolder = attached.holderHits[0] || null;
    return {
      ok: true,
      message: answerMessage({
        intent,
        primaryHolder,
        evidence,
        filterMode: facets.filterMode,
        names,
        windowNote: windowNoteFor(dateFrom, dateTo),
      }),
      intent,
      crimeTypes,
      dateFrom,
      dateTo,
      windowNote: windowNoteFor(dateFrom, dateTo),
      filterMode: facets.filterMode,
      selectedFacets,
      hubs: hubs.map((hub) => publicHub(hub, index)),
      holder: holderSummary(primaryHolder),
      caseCount: evidence.length,
      quantities: groupQuantities(evidenceRows),
      oldLinks: keepOld ? oldLinksFor(hubs, oldEvidence, oldRows) : [],
      evidence,
      warnings: collectWarnings(hubs, attached.loose),
      keywords,
      focusIds: focusIdsFor(index, hubs, evidenceRows, oldRows, crimeTypes, keepOld),
    };
  }
  async function fetchJson(url) {
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  }

  async function foldGraph(graph) {
    if (graph.positions_folded || !window.PositionFold?.foldPositions) return graph;
    let registry = { offices: [], title_prefixes: [] };
    try {
      const loaded = await fetchJson("data/positions.json");
      if (loaded) registry = loaded;
    } catch {
      /* fold with an empty registry rather than skipping the graph */
    }
    return window.PositionFold.foldPositions(graph, registry);
  }

  async function loadGraph() {
    const live = window.BrainGraph?.getGraph?.() || null;
    if (live) return live;
    const res = await fetch(`data/graph.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("ไม่พบ data/graph.json");
    return foldGraph(await res.json());
  }

  async function loadPosts() {
    if (postsOverride?.length) return postsOverride;
    const live = window.NewsApp?.getPosts?.() || null;
    if (live?.length) return live;
    try {
      const feed = await fetchJson("data/feed.json");
      return feed?.posts || [];
    } catch {
      return [];
    }
  }

  async function loadAlias() {
    try {
      return (await fetchJson("data/entity-aliases.json")) || { parents: [] };
    } catch {
      return { parents: [] };
    }
  }

  async function ensureIndex() {
    if (indexCache) return indexCache;
    const graph = await loadGraph();
    const posts = await loadPosts();
    const alias = await loadAlias();
    indexCache = buildIndex(graph, posts, alias);
    return indexCache;
  }

  async function answerQuestion(text, opts) {
    const index = await ensureIndex();
    return answerFromIndex(index, text, opts || {});
  }

  function emptyAnswer(result) {
    return `<div class="rag-answer"><p class="brain-kind">หลักฐานที่ค้นจากกราฟรอบนี้</p><h3>ไม่พบข้อมูลที่ตรงกัน</h3><p>${escapeHtml(result?.message || "ไม่รายงานจำนวน")}</p></div>`;
  }

  function facetNoteText(result) {
    const labels = facetLabels(result.selectedFacets);
    if (labels.length) {
      const suffix = result.filterMode === "and" ? " · ทุกเงื่อนไข" : "";
      return `${escapeHtml(labels.join(" · "))}${suffix}`;
    }
    const hubLine = (result.hubs || []).map((hub) => escapeHtml(hub.title)).join(", ");
    if (!(result.crimeTypes || []).length) return hubLine;
    return `${hubLine} · ประเภท ${escapeHtml(result.crimeTypes.join(", "))}`;
  }

  function holderBlock(holder) {
    if (!holder?.name) return "";
    const position = holder.position ? ` · ${escapeHtml(holder.position)}` : "";
    const org = holder.org ? ` · ${escapeHtml(holder.org)}` : "";
    return `<p class="rag-holder">ผู้ดำรงตำแหน่งปัจจุบัน <strong>${escapeHtml(holder.name)}</strong>${position}${org}</p>`;
  }

  function countBlock(caseCount) {
    if (caseCount == null) return "";
    return `<p class="rag-count"><strong>${caseCount}</strong> ข่าว</p><p class="muted">จำนวนนี้คือนับข่าวที่เชื่อมในกราฟ ไม่ใช่ยอดยึดอย่างเป็นทางการ</p>`;
  }

  function fileLink(path, label) {
    if (!path) return "";
    return `<a href="data/${escapeHtml(path)}">${label}</a>`;
  }

  function quantitySection(group) {
    const items = (group.items || [])
      .map((item) => {
        const org = item.org ? ` · ${escapeHtml(item.org)}` : "";
        return `<li><span class="rag-qty">${escapeHtml(item.display)}</span>${org} · <a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a></li>`;
      })
      .join("");
    return `<section class="rag-qty-group"><h4>${escapeHtml(group.unit)}</h4><p class="muted">${escapeHtml(group.note)}</p><ul>${items}</ul></section>`;
  }

  function evidenceItem(item) {
    const files = [fileLink(item.pdf, "PDF"), fileLink(item.infographic, "Infographic")].filter(Boolean).join(" · ");
    const when = item.date ? escapeHtml(item.date) : "";
    const graphWhen = item.graphDate && item.graphDate !== item.date ? ` · วันที่ในกราฟ ${escapeHtml(item.graphDate)}` : "";
    const crime = item.crime_type ? ` · ${escapeHtml(item.crime_type)}` : "";
    const places = (item.places || []).length ? ` · ${escapeHtml(item.places.join(", "))}` : "";
    const org = item.org ? ` · ${escapeHtml(item.org)}` : "";
    const excerpt = item.excerpt ? `<p>${escapeHtml(item.excerpt)}</p>` : "";
    const fileLine = files ? `<p class="rag-files">${files}</p>` : "";
    return `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a><p class="muted">${when}${graphWhen}${crime}${places}${org}</p>${excerpt}${fileLine}</li>`;
  }

  function oldCaseItem(item) {
    const crime = item.crime_type ? ` · ${escapeHtml(item.crime_type)}` : "";
    return `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a> <span class="muted">${escapeHtml(item.date || "")}${crime}</span></li>`;
  }

  function oldGroup(group) {
    const items = (group.cases || []).map(oldCaseItem).join("");
    return `<section><h4>${escapeHtml(group.relation)} · ${escapeHtml(group.hubTitle)}</h4><ul>${items}</ul></section>`;
  }

  function oldSection(result, oldHtml) {
    if (oldHtml) {
      return `<section><h4>ข่าวอื่นที่ร่วมโหนด</h4><p class="muted">เส้นนี้ใช้ในแผงผลลัพธ์และตอนโฟกัส ไม่ได้ลากบนกราฟภาพรวม</p>${oldHtml}</section>`;
    }
    if (result.filterMode === "and") {
      return `<p class="muted">แสดงเฉพาะข่าวที่ตรงทุกเงื่อนไขที่เลือก ไม่รวมข่าวที่ร่วมโหนดแต่คนละประเภทหรือคนละหน่วยงาน</p>`;
    }
    return `<p class="muted">ไม่มีข่าวอื่นที่ร่วมโหนดนี้นอกจากรายการด้านบน</p>`;
  }

  function focusButton(opts, result) {
    if (opts.focus === false || !(result.focusIds || []).length) return "";
    return `<p><button type="button" class="btn-ghost" data-rag-focus>โฟกัสกราฟเฉพาะกลุ่มนี้</button></p>`;
  }

  function renderResult(result, opts = {}) {
    if (!result?.ok && result?.caseCount == null) return emptyAnswer(result);
    const warnings = (result.warnings || []).map((w) => `<p class="rag-warn">${escapeHtml(w)}</p>`).join("");
    const note = facetNoteText(result);
    const qty = (result.quantities || []).map(quantitySection).join("");
    const list = (result.evidence || []).map(evidenceItem).join("");
    const old = (result.oldLinks || []).map(oldGroup).join("");
    const listTitle = result.intent === "timeline" ? "ลำดับข่าว" : "ข่าวที่ตรงเงื่อนไข";
    const qtySection = qty ? `<section><h4>ตัวเลขจากข้อความข่าว แยกตามหน่วยนับ</h4>${qty}</section>` : "";
    const listSection = list ? `<section><h4>${listTitle}</h4><ol class="rag-cases">${list}</ol></section>` : "";
    const noteLine = note ? ` · ${note}` : "";
    return `<div class="rag-answer">
      <p class="brain-kind">หลักฐานที่ค้นจากกราฟรอบนี้</p>
      <p class="muted">สรุปการค้นนี้สร้างจากโหนดและข่าวที่ตรงคำถามรอบนี้ ไม่ใช่ข้อความสำเร็จรูป</p>
      <h3>${escapeHtml(result.message || "")}</h3>
      ${warnings}
      ${holderBlock(result.holder)}
      <p class="muted">${escapeHtml(result.windowNote || "")}${noteLine}</p>
      ${countBlock(result.caseCount)}
      ${qtySection}
      ${listSection}
      ${oldSection(result, old)}
      ${focusButton(opts, result)}
    </div>`;
  }
  function narrationPayload(result) {
    return {
      intent: result.intent,
      caseCount: result.caseCount,
      crimeTypes: result.crimeTypes || [],
      keywords: result.keywords || [],
      selectedFacets: result.selectedFacets || {},
      filterMode: result.filterMode || "single",
      policy: "ตอบจาก evidence holder และ selectedFacets ใน JSON นี้เท่านั้น ห้ามใช้ความรู้นอกคลัง",
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
      evidence: (result.evidence || []).slice(0, 20).map((item) => ({
        title: item.title,
        excerpt: String(item.excerpt || "").slice(0, 180),
        date: item.date,
        href: item.href,
        position: item.position || "",
        crime_type: item.crime_type || "",
        places: item.places || [],
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
          max_tokens: -1,
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
    let previous = "";
    while (true) {
      const once = await completeChatOnce(url, convo);
      if (!once.ok) return text.trim() ? { ok: true, text: text.trim() } : once;
      if (!once.text || once.text === previous) break;
      text += once.text;
      if (!once.truncated) break;
      previous = once.text;
      convo.push(
        { role: "assistant", content: once.text },
        {
          role: "user",
          content: "คำตอบยังไม่จบ เขียนต่อจากอักขระสุดท้ายทันที ห้ามขึ้นต้นใหม่และห้ามย้ำส่วนที่เขียนไปแล้ว",
        }
      );
    }
    return { ok: true, text: text.trim() };
  }

  function markerText(line, index) {
    if (line[index] !== " " && line[index] !== "\t") return null;
    let j = index;
    while (line[j] === " " || line[j] === "\t") j += 1;
    return line.slice(j);
  }

  function listItem(line) {
    let i = 0;
    while (line[i] === " " || line[i] === "\t") i += 1;
    if (line[i] === "-" || line[i] === "*") {
      const text = markerText(line, i + 1);
      return text == null ? null : { ordered: false, text };
    }
    let j = i;
    while (line[j] >= "0" && line[j] <= "9") j += 1;
    if (j === i || line[j] !== ".") return null;
    const text = markerText(line, j + 1);
    return text == null ? null : { ordered: true, text };
  }

  function headingText(line) {
    let i = 0;
    while (i < 3 && line[i] === "#") i += 1;
    if (!i) return null;
    const text = markerText(line, i);
    return text;
  }

  function renderModelText(raw) {
    const lines = escapeHtml(raw).replaceAll("\r\n", "\n").split("\n");
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
      const item = listItem(line);
      if (item) {
        if (!list || ordered !== item.ordered) {
          flush();
          list = [];
          ordered = item.ordered;
        }
        list.push(`<li>${inline(item.text)}</li>`);
        continue;
      }
      flush();
      if (!line.trim()) continue;
      const heading = headingText(line);
      const body = heading == null ? `<p>${inline(line)}</p>` : `<h4>${inline(heading)}</h4>`;
      html.push(body);
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

  function applyBrainFocus(result) {
    lastFocusIds = result.focusIds || [];
    if (!lastFocusIds.length) {
      window.BrainGraph?.clearFocus?.();
      return;
    }
    window.BrainGraph?.focusOnIds?.(lastFocusIds);
    const meta = document.getElementById("brain-meta");
    if (!meta) return;
    const labels = facetLabels(result.selectedFacets);
    const note = labels.length ? labels.join(" · ") : `${lastFocusIds.length} โหนด`;
    meta.textContent = result.filterMode === "and" ? `กรองตามคำถาม · ${note} · ทุกเงื่อนไข` : `กรองตามคำถาม · ${note}`;
  }

  function replyHtml(reply) {
    if (reply.ok) return `<div class="rag-narration-body">${renderModelText(reply.text)}</div>`;
    return `<p class="rag-warn">${escapeHtml(reply.reason || "เรียกโมเดลไม่สำเร็จ — หลักฐานด้านบนยังใช้ได้")}</p>`;
  }

  function assistantHtml(evidence, analysis) {
    const open = analysis ? "" : " open";
    const body = analysis || `<p class="muted">กำลังให้โมเดลเขียนจากหลักฐานด้านบน…</p>`;
    return `<details class="rag-evidence"${open}><summary>หลักฐานจากกราฟ · โหนด ความเชื่อมโยง และข่าวที่เกี่ยวข้อง</summary>${evidence}</details><section class="rag-llm"><p class="brain-kind">ผลจากโมเดล</p>${body}</section>`;
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
    applyBrainFocus(result);
    const evidence = renderResult(result, { focus: true });
    assistant.innerHTML = assistantHtml(evidence, "");
    assistant.querySelector(".rag-llm")?.scrollIntoView({ block: "nearest" });
    const reply = await askModel(question, result);
    thread.push({ question, result, llmText: reply.ok ? reply.text : "" });
    assistant.innerHTML = assistantHtml(evidence, replyHtml(reply));
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
      void ask(input?.value || "");
    });
    document.getElementById("brain-chat-clear")?.addEventListener("click", () => clearChat());
    document.querySelectorAll("[data-example]").forEach((btn) => {
      const idx = Number(btn.dataset.example);
      const q = EXAMPLES[idx] || btn.textContent || "";
      btn.addEventListener("click", () => {
        if (input) input.value = q;
        void ask(q);
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
