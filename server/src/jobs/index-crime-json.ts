import { getDb } from "../db/index.js";
import { indexCrimeJson } from "../brain/files.js";
import { caseCount } from "../brain/store.js";

getDb();
const r = indexCrimeJson();
console.log(JSON.stringify({ ...r, cases: caseCount() }));
