/**
 * Morning export: DB → {DATE}_line_links.xlsx + .json
 * Schedule: 05:00 Asia/Bangkok (before Task-1 06:00 / Task-2 06:40)
 *
 * Usage: npm run job:export-links
 *        npm run job:export-links -- --date=2026-10-21
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { config } from "../config.js";
import { getDb, listLineLinks, purgeOldFiles, purgeOldLinks, audit } from "../db/index.js";
import { todayIct } from "../line/url.js";

function parseDateArg(): string {
  const arg = process.argv.find((a) => a.startsWith("--date="));
  if (arg) return arg.slice("--date=".length);
  return todayIct();
}

async function main() {
  getDb();
  const date = parseDateArg();
  const rows = listLineLinks(date);

  fs.mkdirSync(config.exportPath, { recursive: true });
  const base = path.join(config.exportPath, `${date}_line_links`);

  const payload = {
    exported_at: new Date().toISOString(),
    timezone: "Asia/Bangkok",
    date,
    count: rows.length,
    links: rows.map((r) => ({
      id: r.id,
      received_at: r.received_at,
      group_alias: r.group_alias,
      url: r.url,
      canonical_url: r.canonical_url,
      domain: r.domain,
      domain_type: r.domain_type,
      fetchable: Boolean(r.fetchable),
      status: r.status,
      used_in_article_id: r.article_id,
      reason: r.reason,
    })),
  };

  fs.writeFileSync(`${base}.json`, JSON.stringify(payload, null, 2), "utf8");

  const wb = new ExcelJS.Workbook();
  wb.creator = "news-hub";
  const ws = wb.addWorksheet("line_links");
  ws.columns = [
    { header: "id", key: "id", width: 8 },
    { header: "received_at", key: "received_at", width: 28 },
    { header: "group_alias", key: "group_alias", width: 16 },
    { header: "url", key: "url", width: 48 },
    { header: "canonical_url", key: "canonical_url", width: 48 },
    { header: "domain", key: "domain", width: 24 },
    { header: "domain_type", key: "domain_type", width: 12 },
    { header: "fetchable", key: "fetchable", width: 10 },
    { header: "status", key: "status", width: 10 },
    { header: "used_in_article_id", key: "used_in_article_id", width: 20 },
  ];
  for (const r of payload.links) {
    ws.addRow({
      ...r,
      fetchable: r.fetchable ? 1 : 0,
    });
  }
  await wb.xlsx.writeFile(`${base}.xlsx`);

  const purged = purgeOldLinks(config.retentionLinksDays);
  const purgedFiles = purgeOldFiles(config.retentionLinksDays);
  audit(
    "job:export-links",
    "export",
    `${date} count=${rows.length} purged=${purged} purged_files=${purgedFiles}`,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        date,
        count: rows.length,
        json: `${base}.json`,
        xlsx: `${base}.xlsx`,
        purged_old_links: purged,
        purged_old_files: purgedFiles,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
