#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const serverDir = path.join(__dirname, "..", "server");
const script = path.join(serverDir, "src", "jobs", "index-crime-json.ts");
const r = spawnSync(process.execPath, ["--import", "tsx", script], {
  cwd: serverDir,
  stdio: "inherit",
  shell: false,
});
process.exit(r.status ?? 1);
