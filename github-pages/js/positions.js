/**
 * Fold office titles out of the entity list at load time.
 * graph.json stays as published; holders come only from data/positions.json.
 * Attaches window.PositionFold.foldPositions(graph, registry).
 */
(() => {
  function norm(s) {
    return String(s ?? "")
      .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function prefixesOf(registry) {
    return [...(registry?.title_prefixes || [])]
      .map((p) => String(p || "").trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
  }

  function prefixOf(title, prefixes) {
    const text = String(title || "").trim();
    for (const prefix of prefixes) {
      if (text === prefix || text.startsWith(prefix)) return prefix;
    }
    return "";
  }

  function joinProp(node, key, value) {
    const next = String(value || "").trim();
    if (!next) return;
    const parts = String(node[key] || "")
      .split(" · ")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.includes(next)) parts.push(next);
    node[key] = parts.join(" · ");
  }

  function setHolder(node, name) {
    const next = String(name || "").trim();
    if (!next) return;
    const parts = String(node.current_holder || "")
      .split(" · ")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.includes(next)) parts.push(next);
    node.current_holder = parts.join(" · ");
  }

  function isBoundary(ch) {
    if (!ch) return true;
    return /[\s.·,\/()（）\-–—]/.test(ch);
  }

  function isWholeToken(hay, needle) {
    let from = 0;
    while (from <= hay.length - needle.length) {
      const at = hay.indexOf(needle, from);
      if (at < 0) return false;
      const before = at === 0 ? "" : hay[at - 1];
      const after = at + needle.length >= hay.length ? "" : hay[at + needle.length];
      if (isBoundary(before) && isBoundary(after)) return true;
      from = at + 1;
    }
    return false;
  }

  function cleanRemainder(raw) {
    return String(raw || "")
      .replace(/^[\s.·,\/()\-–—]+/, "")
      .trim();
  }

  function findOrg(remainder, units) {
    const rest = cleanRemainder(remainder);
    if (rest.length < 2) return null;
    let best = null;
    let bestLen = 0;
    for (const unit of units) {
      const title = String(unit.title || "").trim();
      if (title.length < 2 || title.length > rest.length || title.length < bestLen) continue;
      const exact = rest === title;
      const suffix = rest.endsWith(title);
      const token = isWholeToken(rest, title);
      if (!exact && !suffix && !token) continue;
      if (title.length > bestLen || (exact && best && best.title !== title && title.length === bestLen)) {
        best = unit;
        bestLen = title.length;
      }
    }
    return best;
  }

  function recompute(nodes, edges, prev) {
    const degree = new Map(nodes.map((node) => [node.id, 0]));
    for (const edge of edges) {
      if (degree.has(edge.source)) degree.set(edge.source, degree.get(edge.source) + 1);
      if (degree.has(edge.target)) degree.set(edge.target, degree.get(edge.target) + 1);
    }
    for (const node of nodes) node.degree = degree.get(node.id) || 0;
    const byKind = {};
    const byGroup = {};
    const byLabel = {};
    for (const node of nodes) {
      const kind = node.kind || "other";
      byKind[kind] = (byKind[kind] || 0) + 1;
      if (node.kind === "entity" && node.entity_group) {
        byGroup[node.entity_group] = (byGroup[node.entity_group] || 0) + 1;
      }
    }
    for (const edge of edges) {
      const label = String(edge.label || "").trim();
      if (!label) continue;
      byLabel[label] = (byLabel[label] || 0) + 1;
    }
    return {
      ...(prev || {}),
      nodes: nodes.length,
      edges: edges.length,
      unresolved: byKind.unresolved || 0,
      by_kind: byKind,
      by_entity_group: byGroup,
      by_label: byLabel,
    };
  }

  function foldPositions(graph, registry) {
    if (!graph || graph.positions_folded) return graph;
    const prefixes = prefixesOf(registry);
    const offices = Array.isArray(registry?.offices) ? registry.offices : [];
    const officeByTitle = new Map();
    for (const office of offices) {
      const title = String(office?.title || "").trim();
      if (title) officeByTitle.set(norm(title), office);
    }

    const nodes = (graph.nodes || []).map((node) => ({
      ...node,
      tags: Array.isArray(node.tags) ? node.tags.slice() : [],
    }));
    const edges = (graph.edges || []).map((edge) => ({ ...edge }));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const removeIds = new Set();

    function isPositionNode(node) {
      return node?.kind === "entity" && Boolean(prefixOf(node.title, prefixes));
    }

    function units() {
      return nodes.filter(
        (node) =>
          node.kind === "entity" &&
          node.entity_group === "หน่วย" &&
          !removeIds.has(node.id) &&
          !isPositionNode(node)
      );
    }

    function findUnit(name) {
      const want = norm(name);
      if (!want) return null;
      return units().find((node) => norm(node.title) === want) || null;
    }

    function findPerson(name) {
      const want = norm(name);
      const hits = nodes.filter(
        (node) => !removeIds.has(node.id) && node.kind === "entity" && norm(node.title) === want && !isPositionNode(node)
      );
      return hits.find((node) => node.entity_group === "บุคคล") || hits.find((node) => node.entity_group !== "หน่วย") || null;
    }

    function ensurePerson(name) {
      const existing = findPerson(name);
      if (existing) {
        if (!existing.entity_group) existing.entity_group = "บุคคล";
        return existing;
      }
      let id = `30_Entities/People/${name}`;
      if (byId.has(id)) {
        let n = 2;
        while (byId.has(`${id}#${n}`)) n += 1;
        id = `${id}#${n}`;
      }
      const person = {
        id,
        title: name,
        kind: "entity",
        folder: "30_Entities/People",
        entity_group: "บุคคล",
        date: null,
        case_id: null,
        crime_type: null,
        bureau: null,
        area: null,
        status: null,
        tags: [],
        excerpt: "",
        path: `30_Entities/People/${name}.md`,
        degree: 0,
      };
      nodes.push(person);
      byId.set(id, person);
      return person;
    }

    function applyHolder(office) {
      const title = String(office?.title || "").trim();
      const holder = String(office?.holder || "").trim();
      const orgName = String(office?.org || "").trim();
      if (!title || !holder) return null;
      const person = ensurePerson(holder);
      joinProp(person, "position", title);
      if (orgName) joinProp(person, "position_org", orgName);
      const org = findUnit(orgName);
      if (org) {
        joinProp(org, "position", title);
        setHolder(org, holder);
      }
      return person;
    }

    function rewire(fromId, toId) {
      if (!fromId || !toId || fromId === toId) return;
      for (const edge of edges) {
        if (edge.source === fromId) edge.source = toId;
        if (edge.target === fromId) edge.target = toId;
      }
    }

    function retargetToOrg(posId, orgId) {
      const caseIds = new Set(nodes.filter((node) => node.kind === "case").map((node) => node.id));
      const linked = new Set();
      for (const edge of edges) {
        if (edge.source === orgId) linked.add(edge.target);
        if (edge.target === orgId) linked.add(edge.source);
      }
      for (const edge of edges) {
        if (edge.source !== posId && edge.target !== posId) continue;
        const other = edge.source === posId ? edge.target : edge.source;
        if (!caseIds.has(other) || linked.has(other)) continue;
        if (edge.source === posId) edge.source = orgId;
        else edge.target = orgId;
        if (edge.label === "เกี่ยวข้องกับบุคคล") edge.label = "เกี่ยวข้องกับ";
        linked.add(other);
      }
    }

    function stampCases(posId, title) {
      for (const edge of edges) {
        if (edge.source !== posId && edge.target !== posId) continue;
        const other = byId.get(edge.source === posId ? edge.target : edge.source);
        if (other?.kind === "case") joinProp(other, "position", title);
      }
    }

    for (const pos of nodes) {
      if (!isPositionNode(pos) || removeIds.has(pos.id)) continue;
      const office = officeByTitle.get(norm(pos.title));
      const holder = String(office?.holder || "").trim();
      if (holder) {
        const person = applyHolder(office);
        if (person) rewire(pos.id, person.id);
        removeIds.add(pos.id);
        continue;
      }
      const prefix = prefixOf(pos.title, prefixes);
      const org = findOrg(String(pos.title || "").slice(prefix.length), units());
      if (org) {
        joinProp(org, "position", pos.title);
        retargetToOrg(pos.id, org.id);
      } else {
        stampCases(pos.id, pos.title);
      }
      removeIds.add(pos.id);
    }

    for (const office of offices) {
      if (String(office?.holder || "").trim()) applyHolder(office);
    }

    const kept = nodes.filter((node) => !removeIds.has(node.id));
    const keptIds = new Set(kept.map((node) => node.id));
    const seen = new Set();
    const nextEdges = [];
    for (const edge of edges) {
      if (!keptIds.has(edge.source) || !keptIds.has(edge.target) || edge.source === edge.target) continue;
      const key = `${edge.source}\0${edge.target}\0${edge.label || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      nextEdges.push(edge);
    }
    return {
      ...graph,
      nodes: kept,
      edges: nextEdges,
      stats: recompute(kept, nextEdges, graph.stats),
      positions_folded: true,
    };
  }

  window.PositionFold = { foldPositions };
})();
