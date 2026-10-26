#!/usr/bin/env node
/**
 * Force re-analyze all crime posts + rebuild vault graph.
 * Steps run in separate processes (Node 24 + better-sqlite3 teardown quirk).
 *
 *   node ops/reanalyze-crime-graph.js
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const server = path.join(root, "server");

function run(label, args, cwd) {
  console.log(`\n==> ${label}`);
  const r = spawnSync(process.execPath, args, {
    cwd,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (r.status && r.status !== 0) {
    console.error(`${label} failed with status ${r.status}`);
    process.exit(r.status);
  }
}

run(
  "1/2 force migrate + reindex vault",
  ["--import", "tsx", path.join(server, "src/jobs/_force-migrate.ts")],
  server,
);
run(
  "1b/2 reindex + vault from JSON",
  ["--import", "tsx", path.join(server, "src/jobs/_reindex-vault.ts")],
  server,
);
run("2/2 pages feed + graph", [path.join(root, "ops/rebuild-pages-feed.js")], root);
console.log("\nreanalyze-crime-graph: done");
