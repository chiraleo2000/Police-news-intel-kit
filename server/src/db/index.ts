import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { unlinkStoredFile } from "../line/content.js";
import { SCHEMA_SQL } from "./schema.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 8000");
  db.exec(SCHEMA_SQL);
  return db;
}

export type LineLinkRow = {
  id: number;
  event_id: string | null;
  line_message_id: string | null;
  received_at: string;
  group_alias: string;
  url: string;
  canonical_url: string;
  domain: string;
  domain_type: "official" | "media" | "social" | "unknown";
  fetchable: number;
  status: "new" | "used" | "skipped";
  reason: string | null;
  article_id: string | null;
};

export function insertLineLink(input: {
  eventId?: string | null;
  lineMessageId?: string | null;
  receivedAt: string;
  groupAlias: string;
  url: string;
  canonicalUrl: string;
  domain: string;
  domainType: LineLinkRow["domain_type"];
  fetchable: boolean;
}): { inserted: boolean; id?: number; reason?: string } {
  const database = getDb();
  const receivedDate = input.receivedAt.slice(0, 10);
  try {
    const info = database
      .prepare(
        `INSERT INTO line_links
        (event_id, line_message_id, received_at, received_date, group_alias, url, canonical_url, domain, domain_type, fetchable, status)
        VALUES (@event_id, @line_message_id, @received_at, @received_date, @group_alias, @url, @canonical_url, @domain, @domain_type, @fetchable, 'new')`,
      )
      .run({
        event_id: input.eventId ?? null,
        line_message_id: input.lineMessageId ?? null,
        received_at: input.receivedAt,
        received_date: receivedDate,
        group_alias: input.groupAlias,
        url: input.url,
        canonical_url: input.canonicalUrl,
        domain: input.domain,
        domain_type: input.domainType,
        fetchable: input.fetchable ? 1 : 0,
      });
    return { inserted: true, id: Number(info.lastInsertRowid) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      return { inserted: false, reason: "duplicate" };
    }
    throw e;
  }
}

export type LineFileStatus = "saved" | "metadata_only" | "failed";

export type LineFileRow = {
  id: number;
  event_id: string | null;
  line_message_id: string | null;
  received_at: string;
  group_alias: string;
  message_type: "file" | "image" | "video" | "audio";
  file_name: string | null;
  file_size: number | null;
  content_provider: "line" | "external";
  source_url: string | null;
  stored_path: string | null;
  status: LineFileStatus;
  reason: string | null;
};

export function insertLineFile(input: {
  eventId?: string | null;
  lineMessageId?: string | null;
  receivedAt: string;
  groupAlias: string;
  messageType: LineFileRow["message_type"];
  fileName?: string | null;
  fileSize?: number | null;
  contentProvider: "line" | "external";
  sourceUrl?: string | null;
  storedPath?: string | null;
  status: LineFileStatus;
  reason?: string | null;
}): { inserted: boolean; id?: number; reason?: string } {
  const database = getDb();
  const receivedDate = input.receivedAt.slice(0, 10);
  try {
    const info = database
      .prepare(
        `INSERT INTO line_files
        (event_id, line_message_id, received_at, received_date, group_alias, message_type, file_name, file_size, content_provider, source_url, stored_path, status, reason)
        VALUES (@event_id, @line_message_id, @received_at, @received_date, @group_alias, @message_type, @file_name, @file_size, @content_provider, @source_url, @stored_path, @status, @reason)`,
      )
      .run({
        event_id: input.eventId ?? null,
        line_message_id: input.lineMessageId ?? null,
        received_at: input.receivedAt,
        received_date: receivedDate,
        group_alias: input.groupAlias,
        message_type: input.messageType,
        file_name: input.fileName ?? null,
        file_size: input.fileSize ?? null,
        content_provider: input.contentProvider,
        source_url: input.sourceUrl ?? null,
        stored_path: input.storedPath ?? null,
        status: input.status,
        reason: input.reason ?? null,
      });
    return { inserted: true, id: Number(info.lastInsertRowid) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      return { inserted: false, reason: "duplicate" };
    }
    throw e;
  }
}

export function listLineFiles(date: string): LineFileRow[] {
  return getDb()
    .prepare(
      `SELECT id, event_id, line_message_id, received_at, group_alias, message_type, file_name, file_size, content_provider, source_url, stored_path, status, reason
       FROM line_files
       WHERE received_date = ?
       ORDER BY received_at ASC`,
    )
    .all(date) as LineFileRow[];
}

/** All URL rows (plain text without URLs is never stored). */
export function listAllLineLinks(): LineLinkRow[] {
  return getDb()
    .prepare(
      `SELECT id, event_id, line_message_id, received_at, group_alias, url, canonical_url, domain, domain_type, fetchable, status, reason, article_id
       FROM line_links
       ORDER BY received_at ASC, id ASC`,
    )
    .all() as LineLinkRow[];
}

/** All upload rows (file/image/video/audio only). */
export function listAllLineFiles(): LineFileRow[] {
  return getDb()
    .prepare(
      `SELECT id, event_id, line_message_id, received_at, group_alias, message_type, file_name, file_size, content_provider, source_url, stored_path, status, reason
       FROM line_files
       ORDER BY received_at ASC, id ASC`,
    )
    .all() as LineFileRow[];
}

export function deleteByMessageId(lineMessageId: string): number {
  const database = getDb();
  const files = database
    .prepare(`SELECT stored_path FROM line_files WHERE line_message_id = ?`)
    .all(lineMessageId) as Array<{ stored_path: string | null }>;
  const links = database
    .prepare(`DELETE FROM line_links WHERE line_message_id = ?`)
    .run(lineMessageId);
  const uploads = database
    .prepare(`DELETE FROM line_files WHERE line_message_id = ?`)
    .run(lineMessageId);
  for (const f of files) unlinkStoredFile(f.stored_path);
  return links.changes + uploads.changes;
}

export function purgeOldFiles(days: number): number {
  const database = getDb();
  const modifier = `-${days} days`;
  const files = database
    .prepare(
      `SELECT stored_path FROM line_files WHERE received_date < date('now', ?)`,
    )
    .all(modifier) as Array<{ stored_path: string | null }>;
  for (const f of files) unlinkStoredFile(f.stored_path);
  return database
    .prepare(`DELETE FROM line_files WHERE received_date < date('now', ?)`)
    .run(modifier).changes;
}

export function listLineLinks(date: string, status?: string): LineLinkRow[] {
  const database = getDb();
  if (status) {
    return database
      .prepare(
        `SELECT * FROM line_links
         WHERE received_date = ? AND status = ?
         ORDER BY received_at ASC`,
      )
      .all(date, status) as LineLinkRow[];
  }
  return database
    .prepare(
      `SELECT * FROM line_links
       WHERE received_date = ?
       ORDER BY received_at ASC`,
    )
    .all(date) as LineLinkRow[];
}

export function listRecentNewLinks(days: number): LineLinkRow[] {
  // Compare on received_date (ICT YYYY-MM-DD) so morning Bangkok jobs stay consistent
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const startDate = fmt.format(start);
  return getDb()
    .prepare(
      `SELECT * FROM line_links
       WHERE status = 'new' AND received_date >= ?
       ORDER BY received_at ASC`,
    )
    .all(startDate) as LineLinkRow[];
}

export function markLineLinks(
  ids: number[],
  status: "used" | "skipped",
  articleId?: string | null,
  reason?: string | null,
): number {
  if (!ids.length) return 0;
  const database = getDb();
  const stmt = database.prepare(
    `UPDATE line_links
     SET status = @status, article_id = COALESCE(@article_id, article_id), reason = COALESCE(@reason, reason)
     WHERE id = @id`,
  );
  const tx = database.transaction((list: number[]) => {
    let n = 0;
    for (const id of list) {
      n += stmt.run({
        id,
        status,
        article_id: articleId ?? null,
        reason: reason ?? null,
      }).changes;
    }
    return n;
  });
  return tx(ids);
}

export function purgeOldLinks(days: number): number {
  return getDb()
    .prepare(`DELETE FROM line_links WHERE date(received_at) < date('now', ?)`)
    .run(`-${days} days`).changes;
}

export function seenEvent(eventId: string): boolean {
  const database = getDb();
  const row = database.prepare(`SELECT 1 FROM webhook_seen WHERE event_id = ?`).get(eventId);
  if (row) return true;
  database
    .prepare(`INSERT INTO webhook_seen (event_id, at) VALUES (?, ?)`)
    .run(eventId, new Date().toISOString());
  return false;
}

export function audit(actor: string, action: string, detail: string) {
  getDb()
    .prepare(`INSERT INTO audit_log (at, actor, action, detail) VALUES (?, ?, ?, ?)`)
    .run(new Date().toISOString(), actor, action, detail);
}

export function getRunStatus(task: string) {
  const rows = getDb()
    .prepare(
      `SELECT * FROM run_status WHERE task = ? ORDER BY run_date DESC LIMIT 30`,
    )
    .all(task) as Array<{
    task: string;
    run_date: string;
    status: string;
    finished_at: string | null;
  }>;
  const lastComplete = rows.find((r) => r.status === "complete");
  return {
    task,
    last_complete_date: lastComplete?.run_date ?? null,
    recent: rows,
  };
}

export function putRunStatus(input: {
  task: string;
  run_date: string;
  status: string;
  counts_json?: string;
  issues_json?: string;
}) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO run_status (task, run_date, status, counts_json, issues_json, started_at, finished_at)
       VALUES (@task, @run_date, @status, @counts_json, @issues_json, @now, @now)
       ON CONFLICT(task, run_date) DO UPDATE SET
         status=excluded.status,
         counts_json=excluded.counts_json,
         issues_json=excluded.issues_json,
         finished_at=excluded.finished_at`,
    )
    .run({
      ...input,
      counts_json: input.counts_json ?? null,
      issues_json: input.issues_json ?? null,
      now,
    });
}
