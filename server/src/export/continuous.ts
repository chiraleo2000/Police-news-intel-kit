import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { config } from "../config.js";
import { audit, getDb, listAllLineFiles, listAllLineLinks, repairLineUrlJunk } from "../db/index.js";

export type ContinuousExportResult = {
  ok: boolean;
  xlsx: string;
  json: string;
  url_count: number;
  file_count: number;
  skipped_locked?: boolean;
};

/**
 * Rewrite the rolling workbook from SQLite.
 * Only URL rows and upload rows are present — plain LINE chat text is never stored.
 * Writes via a temp file so Excel locking does not corrupt the continuous book.
 */
export async function writeContinuousIntakeExcel(): Promise<ContinuousExportResult> {
  getDb();
  const repaired = repairLineUrlJunk();
  if (repaired) audit("line-export", "url_junk_repaired", `rows=${repaired}`);
  const links = listAllLineLinks();
  const files = listAllLineFiles();

  fs.mkdirSync(config.exportPath, { recursive: true });
  const xlsxPath = path.resolve(config.continuousXlsxPath);
  const jsonPath = path.resolve(config.continuousJsonPath);
  const tmpXlsx = `${xlsxPath}.tmp`;
  const tmpJson = `${jsonPath}.tmp`;

  const rows = [
    ...links.map((r) => ({
      kind: "url" as const,
      id: r.id,
      received_at: r.received_at,
      group_alias: r.group_alias,
      content: r.canonical_url || r.url,
      url: r.url,
      canonical_url: r.canonical_url,
      domain: r.domain,
      domain_type: r.domain_type,
      fetchable: Boolean(r.fetchable),
      message_type: "text",
      file_name: null as string | null,
      file_size: null as number | null,
      stored_path: null as string | null,
      source_url: null as string | null,
      status: r.status,
      reason: r.reason,
      used_in_article_id: r.article_id,
      line_message_id: r.line_message_id,
    })),
    ...files.map((r) => ({
      kind: "file" as const,
      id: r.id,
      received_at: r.received_at,
      group_alias: r.group_alias,
      content: r.stored_path || r.file_name || r.source_url || r.message_type,
      url: null as string | null,
      canonical_url: null as string | null,
      domain: null as string | null,
      domain_type: null as string | null,
      fetchable: null as boolean | null,
      message_type: r.message_type,
      file_name: r.file_name,
      file_size: r.file_size,
      stored_path: r.stored_path,
      source_url: r.source_url,
      status: r.status,
      reason: r.reason,
      used_in_article_id: null as string | null,
      line_message_id: r.line_message_id,
    })),
  ].sort((a, b) => {
    if (a.received_at === b.received_at) return a.id - b.id;
    return a.received_at < b.received_at ? -1 : 1;
  });

  const payload = {
    exported_at: new Date().toISOString(),
    timezone: "Asia/Bangkok",
    note: "URLs and uploads only — plain chat text is not stored",
    url_count: links.length,
    file_count: files.length,
    items: rows,
  };

  fs.writeFileSync(tmpJson, JSON.stringify(payload, null, 2), "utf8");
  try {
    fs.renameSync(tmpJson, jsonPath);
  } catch {
    fs.copyFileSync(tmpJson, jsonPath);
    fs.rmSync(tmpJson, { force: true });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "news-hub";
  wb.created = new Date();
  const ws = wb.addWorksheet("line_intake");
  ws.columns = [
    { header: "kind", key: "kind", width: 8 },
    { header: "id", key: "id", width: 8 },
    { header: "received_at", key: "received_at", width: 28 },
    { header: "group_alias", key: "group_alias", width: 16 },
    { header: "content", key: "content", width: 52 },
    { header: "url", key: "url", width: 40 },
    { header: "canonical_url", key: "canonical_url", width: 40 },
    { header: "domain", key: "domain", width: 22 },
    { header: "domain_type", key: "domain_type", width: 12 },
    { header: "fetchable", key: "fetchable", width: 10 },
    { header: "message_type", key: "message_type", width: 12 },
    { header: "file_name", key: "file_name", width: 24 },
    { header: "file_size", key: "file_size", width: 12 },
    { header: "stored_path", key: "stored_path", width: 28 },
    { header: "source_url", key: "source_url", width: 36 },
    { header: "status", key: "status", width: 14 },
    { header: "reason", key: "reason", width: 18 },
    { header: "used_in_article_id", key: "used_in_article_id", width: 18 },
    { header: "line_message_id", key: "line_message_id", width: 18 },
  ];
  for (const r of rows) {
    ws.addRow({
      ...r,
      fetchable: r.fetchable == null ? "" : r.fetchable ? 1 : 0,
    });
  }
  await wb.xlsx.writeFile(tmpXlsx);

  let skippedLocked = false;
  try {
    if (fs.existsSync(xlsxPath)) fs.rmSync(xlsxPath, { force: true });
    fs.renameSync(tmpXlsx, xlsxPath);
  } catch {
    const alt = `${xlsxPath}.new`;
    try {
      fs.copyFileSync(tmpXlsx, alt);
      skippedLocked = true;
      audit(
        "job:export-continuous",
        "xlsx_locked",
        `wrote ${alt} — close Excel and re-run to replace ${xlsxPath}`,
      );
    } finally {
      fs.rmSync(tmpXlsx, { force: true });
    }
  }

  audit(
    "job:export-continuous",
    "export",
    `urls=${links.length} files=${files.length} locked=${skippedLocked ? 1 : 0}`,
  );

  return {
    ok: true,
    xlsx: skippedLocked ? `${xlsxPath}.new` : xlsxPath,
    json: jsonPath,
    url_count: links.length,
    file_count: files.length,
    skipped_locked: skippedLocked,
  };
}
