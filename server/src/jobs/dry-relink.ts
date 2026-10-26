import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planCaseRelations } from "../brain/relate.js";
import type { PostV2 } from "../brain/enrich.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const data = path.join(root, "github-pages", "data");
const rows: Array<{ day: string; post: PostV2 }> = [];
for (const name of fs.readdirSync(data)) {
  if (!/^\d{4}-\d{2}-\d{2}_crime(_line)?\.json$/.test(name)) continue;
  const doc = JSON.parse(fs.readFileSync(path.join(data, name), "utf8")) as { posts?: PostV2[] };
  const day = name.slice(0, 10);
  for (const post of doc.posts || []) rows.push({ day, post });
}
const { edges, rels } = planCaseRelations(rows);
for (const e of edges) console.log(`${e.a} <-> ${e.b} | ${e.follow ? "follow" : "related"} | ${e.via}`);
const drug = rels.get("20261026-drug-02") || [];
const hat = rels.get("20261022-drug-hatyai-etomidate") || [];
const pod = rels.get("20261026-drug-01") || [];
console.log("EDGES", edges.length);
console.log("PPPS", JSON.stringify(drug));
console.log("HATYAI", JSON.stringify(hat));
console.log("PRATUNAM", JSON.stringify(pod));
const linkedPosts = [...rels.values()].filter((list) => list.length).length;
console.log("POSTS_WITH_LINKS", linkedPosts, "OF", rels.size);
