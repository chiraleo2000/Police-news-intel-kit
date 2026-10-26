import { getDb } from "../db/index.js";
import { migrateCrimeJson } from "../brain/files.js";
import { caseCount } from "../brain/store.js";

const db = getDb();
const r = migrateCrimeJson();
console.log(JSON.stringify({ ...r, cases: caseCount() }, null, 2));
db.close();
if (r.errors.length) process.exitCode = 1;
