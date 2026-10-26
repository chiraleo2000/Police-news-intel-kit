import { getDb } from "../db/index.js";
import { searchBrain, timelineBrain } from "../brain/store.js";

const db = getDb();
const people = db.prepare(`SELECT name FROM entities WHERE kind='person' ORDER BY name`).all();
console.log("person_entities", people);
const hit = searchBrain("สงขลา", "case", 5);
console.log("search_songkhla", hit.cases.length, hit.cases[0]);
const tl = timelineBrain("2026-10-22", "2026-10-26");
console.log("timeline", tl.cases.length, tl.relations.length);
db.close();
