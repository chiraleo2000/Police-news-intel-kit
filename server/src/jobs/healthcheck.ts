import { getDb } from "../db/index.js";
import { todayIct } from "../line/url.js";

getDb();
console.log(JSON.stringify({ ok: true, today_ict: todayIct() }));
