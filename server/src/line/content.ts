import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const CONTENT_API = "https://api-data.line.me/v2/bot/message";

export function safeMessageId(messageId: string): string {
  return messageId.replace(/[^A-Za-z0-9_-]/g, "");
}

export function resolveUnderFilesRoot(rel: string): string | null {
  const root = path.resolve(config.lineFilesPath);
  const abs = path.resolve(root, rel);
  const relToRoot = path.relative(root, abs);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) return null;
  return abs;
}

export function unlinkStoredFile(rel: string | null | undefined): void {
  if (!rel) return;
  const abs = resolveUnderFilesRoot(rel);
  if (!abs) return;
  fs.rmSync(abs, { force: true });
}

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const len = Number(res.headers.get("content-length") || "0");
  if (Number.isFinite(len) && len > maxBytes) {
    await res.body?.cancel();
    throw new Error("too_large");
  }
  if (!res.body) throw new Error("empty_body");
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("too_large");
    }
    chunks.push(Buffer.from(value));
  }
  if (!total) throw new Error("empty_body");
  return Buffer.concat(chunks);
}

/** Download bytes LINE hosts for a message. Does not follow external contentProvider URLs. */
export async function fetchLineMessageContent(
  messageId: string,
): Promise<{ body: Buffer; contentType: string }> {
  const token = config.lineChannelAccessToken;
  if (!token) throw new Error("no_access_token");
  const id = safeMessageId(messageId);
  if (!id) throw new Error("bad_message_id");

  const res = await fetch(`${CONTENT_API}/${id}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`line_content_${res.status}`);
  }
  const body = await readCapped(res, config.lineFileMaxBytes);
  const contentType = res.headers.get("content-type") ?? "";
  return { body, contentType };
}

/** Write bytes under LINE_FILES_PATH. `ext` must already be a safe token. Returns a relative path. */
export function writeUploadFile(
  receivedDate: string,
  messageId: string,
  ext: string,
  body: Buffer,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) throw new Error("bad_date");
  if (!/^[a-z0-9]{1,8}$/.test(ext)) throw new Error("bad_ext");
  const id = safeMessageId(messageId);
  if (!id) throw new Error("bad_message_id");
  const rel = `${receivedDate}/${id}.${ext}`;
  const abs = resolveUnderFilesRoot(rel);
  if (!abs) throw new Error("bad_path");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  return rel;
}
