/**
 * Force re-analyze all crime JSON posts:
 * - rewrite template exec_blurb / analysis_notes from content + fields
 * - rebuild related_cases with stricter shared-signal rules
 * - reset SQLite brain index, reindex, rebuild vault notes + Pages graph
 *
 * Usage (from server/): npx tsx src/jobs/reanalyze-crime-graph.ts
 * Or: node ops/reanalyze-crime-graph.js
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db/index.js";
import { migrateCrimeJson } from "../brain/files.js";
import { caseCount, resetBrainIndex } from "../brain/store.js";
import { buildVaultFromDb } from "./vault-build.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, "../../..");

getDb();
console.log("1/4 reset brain index (cases/entities/relations)");
resetBrainIndex();

console.log("2/4 migrate crime JSON with force analysis + related");
const r = migrateCrimeJson({ forceAnalysis: true, forceRelated: true });
console.log(JSON.stringify({ migrate: r, cases: caseCount() }, null, 2));

console.log("3/4 vault-build (in-process)");
const vault = buildVaultFromDb();
console.log(JSON.stringify(vault));

console.log("4/4 rebuild Pages feed + graph.json");
const feed = spawnSync(process.execPath, [path.join(kitRoot, "ops", "rebuild-pages-feed.js")], {
  cwd: kitRoot,
  stdio: "inherit",
  shell: false,
});
if (r.errors.length) process.exitCode = 1;
if ((feed.status ?? 1) !== 0) process.exit(feed.status ?? 1);
console.log("reanalyze-crime-graph: done");
