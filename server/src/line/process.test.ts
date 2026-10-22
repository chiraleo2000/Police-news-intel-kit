/**
 * Offline intake check: only URL text and uploads are stored.
 * Env is set before imports so this never touches the real DB.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "line-wh-"));
process.env.DB_PATH = path.join(dir, "t.sqlite");
process.env.LINE_FILES_PATH = path.join(dir, "files");
process.env.LINE_CHANNEL_SECRET = "test-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN = "";
process.env.LINE_ALLOWED_GROUP_IDS = "Ctestgroup1";
process.env.LINE_GROUP_ALIASES = "Ctestgroup1=crime-desk";
process.env.NEWSINTEL_HOME = dir;
process.env.EXPORT_PATH = path.join(dir, "exports");
process.env.SKIP_CONTINUOUS_EXPORT = "1";

const { processLineEvents } = await import("./process.js");
const { listLineFiles, listLineLinks } = await import("../db/index.js");
const { todayIct } = await import("./url.js");

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const group = { type: "group", groupId: "Ctestgroup1", userId: "UshouldNotStore" };

await processLineEvents([
  {
    type: "message",
    webhookEventId: "e1",
    source: group,
    message: { type: "text", id: "m1", text: "สวัสดี ไม่มีลิงก์" },
  },
  {
    type: "message",
    webhookEventId: "e2",
    source: group,
    message: { type: "text", id: "m2", text: "ดู https://1.1.1.1/news/1?utm_source=line" },
  },
  {
    type: "message",
    webhookEventId: "e3",
    source: group,
    message: { type: "sticker", id: "m3" },
  },
  {
    type: "message",
    webhookEventId: "e4",
    source: group,
    message: { type: "file", id: "m4", fileName: "report.pdf", fileSize: 100 },
  },
  {
    type: "message",
    webhookEventId: "e5",
    source: group,
    message: { type: "file", id: "m5", fileName: "evil.exe", fileSize: 100 },
  },
  {
    type: "message",
    webhookEventId: "e6",
    source: { type: "group", groupId: "Cother", userId: "Ux" },
    message: { type: "text", id: "m6", text: "https://1.1.1.1/secret" },
  },
  {
    type: "message",
    webhookEventId: "e7",
    source: group,
    message: {
      type: "image",
      id: "m7",
      contentProvider: {
        type: "external",
        originalContentUrl: "https://1.1.1.1/pic.jpg",
      },
    },
  },
]);

const date = todayIct();
const links = listLineLinks(date);
const files = listLineFiles(date);
assert(links.length === 1, `expected 1 link, got ${links.length}`);
assert(links[0]?.canonical_url === "https://1.1.1.1/news/1", `canon ${links[0]?.canonical_url}`);
assert(links[0]?.group_alias === "crime-desk", "alias");
assert(!JSON.stringify(links).includes("UshouldNotStore"), "userId leaked into links");
assert(!JSON.stringify(links).includes("สวัสดี"), "plain text stored");

assert(files.length === 3, `expected 3 files, got ${files.length}`);
const pdf = files.find((f) => f.line_message_id === "m4");
assert(pdf?.status === "metadata_only" && pdf.reason === "no_access_token", `pdf ${pdf?.reason}`);
const exe = files.find((f) => f.line_message_id === "m5");
assert(exe?.reason === "extension_blocked", `exe ${exe?.reason}`);
const img = files.find((f) => f.line_message_id === "m7");
assert(img?.reason === "external_content", `image ${img?.reason}`);
assert(img?.source_url === "https://1.1.1.1/pic.jpg", "external url kept");
assert(!JSON.stringify(files).includes("UshouldNotStore"), "userId leaked into files");

await processLineEvents([
  { type: "unsend", webhookEventId: "e8", unsend: { messageId: "m2" } },
  { type: "unsend", webhookEventId: "e9", unsend: { messageId: "m4" } },
]);
assert(listLineLinks(date).length === 0, "unsend did not remove link");
assert(!listLineFiles(date).some((f) => f.line_message_id === "m4"), "unsend did not remove file");

console.log("process.test ok");
