import crypto from "node:crypto";

/** Verify LINE Messaging API x-line-signature (HMAC-SHA256 of raw body). */
export function verifyLineSignature(
  channelSecret: string,
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader || !channelSecret) return false;
  const body = typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody;
  const digest = crypto
    .createHmac("sha256", channelSecret)
    .update(body)
    .digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
