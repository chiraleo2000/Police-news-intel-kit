import { getDb } from "../db/index.js";
import type { PostV2, Rel } from "./enrich.js";
import { commandersIn, relForStage, unitsOf } from "./enrich.js";
import { extractPostEntities } from "./entities.js";

export type CaseRow = {
  id: string;
  date: string;
  title: string;
  topic: string | null;
  bureau: string | null;
  province_json: string | null;
  status_th: string | null;
  gang_or_group: string | null;
  severity: string | null;
  area: string | null;
  payload_json: string | null;
  format_version: number;
  updated_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function entityId(kind: string, name: string) {
  return `${kind}:${name.trim()}`;
}

function entityKindForGroup(group: string): "unit" | "person" | "project" | null {
  if (group === "หน่วย") return "unit";
  if (group === "บุคคล" || group === "ผู้ต้องหา") return "person";
  if (group === "ข่ายเครือข่าย" || group === "บัญชี") return "project";
  return null;
}

export function upsertEntity(kind: "unit" | "person" | "project", name: string) {
  const n = name.trim();
  if (!n || n === "-") return;
  const db = getDb();
  db.prepare(
    `INSERT INTO entities (id, kind, name, aliases_json, updated_at)
     VALUES (@id, @kind, @name, '[]', @updated_at)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at`,
  ).run({ id: entityId(kind, n), kind, name: n, updated_at: nowIso() });
}

export function upsertRelation(
  srcType: string,
  srcId: string,
  rel: string,
  dstType: string,
  dstId: string,
) {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO relations (src_type, src_id, rel, dst_type, dst_id)
       VALUES (@src_type, @src_id, @rel, @dst_type, @dst_id)`,
    )
    .run({ src_type: srcType, src_id: srcId, rel, dst_type: dstType, dst_id: dstId });
}

export function indexPost(post: PostV2, day: string) {
  const id = String(post.id || "").trim();
  if (!id) return;
  const db = getDb();
  const units = unitsOf(post);
  const text = `${post.title || ""}\n${post.exec_blurb || ""}\n${String(post.content || "").slice(0, 500)}`;
  db.prepare(
    `INSERT INTO cases
      (id, date, title, topic, bureau, province_json, status_th, gang_or_group, severity, area, payload_json, format_version, updated_at)
     VALUES
      (@id, @date, @title, @topic, @bureau, @province_json, @status_th, @gang_or_group, @severity, @area, @payload_json, @format_version, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
      date=excluded.date, title=excluded.title, topic=excluded.topic, bureau=excluded.bureau,
      province_json=excluded.province_json, status_th=excluded.status_th, gang_or_group=excluded.gang_or_group,
      severity=excluded.severity, area=excluded.area, payload_json=excluded.payload_json,
      format_version=excluded.format_version, updated_at=excluded.updated_at`,
  ).run({
    id,
    date: day,
    title: String(post.title || id),
    topic: post.topic || null,
    bureau: post.primary_bureau || null,
    province_json: JSON.stringify(post.province || []),
    status_th: post.status_th || null,
    gang_or_group: post.gang_or_group || null,
    severity: post.severity || null,
    area: post.area || null,
    payload_json: JSON.stringify({
      exec_blurb: post.exec_blurb || "",
      analysis_notes: post.analysis_notes || "",
      references: post.references || [],
      related_cases: post.related_cases || [],
      source_url: post.source_url || "",
      corroborating_sources: post.corroborating_sources || [],
      content_len: String(post.content || "").length,
      units,
    }),
    format_version: Number(post.format_version || 1),
    updated_at: nowIso(),
  });

  const stageRel = relForStage(post.case_stage);
  for (const u of units) {
    upsertEntity("unit", u);
    upsertRelation("case", id, stageRel, "entity", entityId("unit", u));
  }
  if (post.primary_bureau && post.primary_bureau !== "-" && !units.includes(post.primary_bureau)) {
    upsertEntity("unit", post.primary_bureau);
    upsertRelation("case", id, "ordered_by", "entity", entityId("unit", post.primary_bureau));
  }
  if (post.gang_or_group && post.gang_or_group !== "-") {
    upsertEntity("project", post.gang_or_group);
    upsertRelation("case", id, "targets_network", "entity", entityId("project", post.gang_or_group));
  }
  for (const person of commandersIn(text)) {
    upsertEntity("person", person);
    upsertRelation("case", id, "announced_by", "entity", entityId("person", person));
  }
  for (const ent of extractPostEntities(post)) {
    const kind = entityKindForGroup(ent.group);
    if (!kind) continue;
    upsertEntity(kind, ent.name);
    upsertRelation("case", id, ent.rel, "entity", entityId(kind, ent.name));
  }
  for (const rel of post.related_cases || []) {
    if (!rel?.id) continue;
    upsertRelation("case", id, rel.relation || "related_to", "case", rel.id);
  }
}

export function searchBrain(q: string, type?: string, limit = 30) {
  const db = getDb();
  const like = `%${q.trim()}%`;
  const lim = Math.min(80, Math.max(1, limit));
  const wantCase = !type || type === "case";
  const wantEntity = !type || type === "unit" || type === "person" || type === "project" || type === "entity";
  const cases = wantCase
    ? (db
        .prepare(
          `SELECT id, date, title, topic, bureau, area, status_th, gang_or_group, severity
           FROM cases
           WHERE title LIKE @q OR topic LIKE @q OR bureau LIKE @q OR area LIKE @q
              OR gang_or_group LIKE @q OR province_json LIKE @q OR status_th LIKE @q
           ORDER BY date DESC LIMIT @lim`,
        )
        .all({ q: like, lim }) as Array<Record<string, unknown>>)
    : [];
  const kind =
    type === "unit" || type === "person" || type === "project" ? type : null;
  const entities = wantEntity
    ? (db
        .prepare(
          `SELECT id, kind, name FROM entities
           WHERE name LIKE @q AND (@kind IS NULL OR kind = @kind)
           ORDER BY name LIMIT @lim`,
        )
        .all({ q: like, kind, lim }) as Array<Record<string, unknown>>)
    : [];
  return { query: q, type: type || "all", cases, entities };
}

export function timelineBrain(since: string, until: string, bureau?: string, crimeType?: string) {
  const db = getDb();
  const cases = db
    .prepare(
      `SELECT id, date, title, topic, bureau, area, status_th, gang_or_group, severity
       FROM cases
       WHERE date >= @since AND date <= @until
         AND (@bureau IS NULL OR bureau = @bureau OR bureau LIKE @bureauLike)
         AND (@topic IS NULL OR topic = @topic)
       ORDER BY date, id`,
    )
    .all({
      since,
      until,
      bureau: bureau || null,
      bureauLike: bureau ? `%${bureau}%` : null,
      topic: crimeType || null,
    }) as Array<{ id: string }>;
  const ids = cases.map((c) => c.id);
  let relations: unknown[] = [];
  if (ids.length) {
    const marks = ids.map(() => "?").join(",");
    relations = db
      .prepare(
        `SELECT src_type, src_id, rel, dst_type, dst_id FROM relations
         WHERE src_type = 'case' AND src_id IN (${marks})`,
      )
      .all(...ids);
  }
  return { since, until, cases, relations };
}

export function listCases(): CaseRow[] {
  return getDb().prepare(`SELECT * FROM cases ORDER BY date, id`).all() as CaseRow[];
}

export function listRelationsForCase(id: string): Array<Rel & { dst_type: string }> {
  const rows = getDb()
    .prepare(
      `SELECT rel, dst_type, dst_id FROM relations WHERE src_type='case' AND src_id=?`,
    )
    .all(id) as Array<{ rel: string; dst_type: string; dst_id: string }>;
  return rows.map((r) => ({
    rel: r.rel,
    dst_type: r.dst_type,
    target: r.dst_id.includes(":") ? r.dst_id.slice(r.dst_id.indexOf(":") + 1) : r.dst_id,
  }));
}

export function caseCount() {
  const row = getDb().prepare(`SELECT COUNT(*) AS n FROM cases`).get() as { n: number };
  return row.n;
}

/** Wipe case/entity graph tables before a full reindex (keeps LINE/webhook tables). */
export function resetBrainIndex() {
  const db = getDb();
  db.exec(`
    DELETE FROM relations;
    DELETE FROM cases;
    DELETE FROM entities;
  `);
}
