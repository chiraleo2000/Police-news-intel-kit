import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { todayIct } from "../line/url.js";

fs.mkdirSync(config.backupPath, { recursive: true });
if (fs.existsSync(config.dbPath)) {
  const dest = path.join(config.backupPath, `${todayIct()}_newshub.sqlite`);
  fs.copyFileSync(config.dbPath, dest);
  console.log(JSON.stringify({ ok: true, dest }));
} else {
  console.log(JSON.stringify({ ok: false, error: "no_db" }));
  process.exit(1);
}
