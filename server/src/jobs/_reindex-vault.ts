import { getDb } from "../db/index.js";
import { indexCrimeJson } from "../brain/files.js";
import { caseCount, resetBrainIndex } from "../brain/store.js";
import { buildVaultFromDb } from "./vault-build.js";

const db = getDb();
resetBrainIndex();
const indexed = indexCrimeJson();
db.pragma("wal_checkpoint(TRUNCATE)");
console.log(JSON.stringify({ indexed, cases: caseCount() }));
const vault = buildVaultFromDb();
db.pragma("wal_checkpoint(TRUNCATE)");
console.log(JSON.stringify(vault));
(globalThis as typeof globalThis & { __newsHubDb?: unknown }).__newsHubDb = db;
setTimeout(() => process.exit(0), 50);
