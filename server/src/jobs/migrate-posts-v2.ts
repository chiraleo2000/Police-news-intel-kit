import { getDb } from "../db/index.js";
import { migrateCrimeJson } from "../brain/files.js";
import { caseCount } from "../brain/store.js";

const db = getDb();
const r = migrateCrimeJson();
console.log(JSON.stringify({ ...r, cases: caseCount() }, null, 2));
(globalThis as typeof globalThis & { __newsHubDb?: unknown }).__newsHubDb = db;
if (r.errors.length) process.exitCode = 1;
setTimeout(() => process.exit(r.errors.length ? 1 : 0), 50);
