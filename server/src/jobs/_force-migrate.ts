/**
 * Rewrite crime JSON + Document HTML/vault case links only.
 * DB reset/index lives in _reindex-vault.ts (separate process — Node 24 + better-sqlite3).
 */
import { migrateCrimeJson } from "../brain/files.js";

console.log("migrate…");
const r = migrateCrimeJson({ forceAnalysis: true, forceRelated: true });
console.log(JSON.stringify({ migrate: r }, null, 2));
if (r.errors.length) process.exitCode = 1;
setTimeout(() => process.exit(r.errors.length ? 1 : 0), 50);
