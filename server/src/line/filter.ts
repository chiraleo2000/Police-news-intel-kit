import { extractUrls } from "./url.js";

/** LINE message types that carry an uploaded blob (not stickers/location). */
export const UPLOAD_MESSAGE_TYPES = ["file", "image", "video", "audio"] as const;
export type UploadMessageType = (typeof UPLOAD_MESSAGE_TYPES)[number];

const UPLOAD_SET = new Set<string>(UPLOAD_MESSAGE_TYPES);

/** Extensions we will write to disk for type=file. Executables stay metadata-only. */
const ALLOWED_FILE_EXT = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "rtf",
  "ppt",
  "pptx",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "heic",
  "mp4",
  "mov",
  "m4v",
  "webm",
  "m4a",
  "mp3",
  "wav",
  "aac",
  "zip",
]);

const BLOCKED_FILE_EXT = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "dll",
  "scr",
  "ps1",
  "vbs",
  "js",
  "jse",
  "wsf",
  "cpl",
  "jar",
  "sh",
  "apk",
  "hta",
  "lnk",
]);

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/msword": "doc",
  "application/vnd.ms-excel": "xls",
  "application/vnd.ms-powerpoint": "ppt",
};

const DANGEROUS_CONTENT_TYPES = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/javascript",
  "text/javascript",
  "application/x-sh",
  "application/x-bat",
  "application/x-httpd-php",
]);

export type LineContentProvider = {
  type?: string;
  originalContentUrl?: string;
  previewImageUrl?: string;
};

export type LineIncomingMessage = {
  type?: string;
  id?: string;
  text?: string;
  altText?: string;
  title?: string;
  /** Flex / template payload — may embed https URLs. */
  contents?: unknown;
  fileName?: string;
  fileSize?: number;
  contentProvider?: LineContentProvider;
};

/** Collect text fields where LINE may place URLs (never used to store chat prose). */
export function messageUrlHaystack(message: LineIncomingMessage | undefined): string {
  if (!message) return "";
  const parts: string[] = [];
  if (message.text) parts.push(message.text);
  if (message.altText) parts.push(message.altText);
  if (message.title) parts.push(message.title);
  if (message.contents != null) {
    try {
      parts.push(JSON.stringify(message.contents));
    } catch {
      /* ignore */
    }
  }
  // Facebook / LINE share cards sometimes tuck the URL only in nested action.uri
  // fields that are easier to catch by stringifying the whole message payload.
  try {
    const full = JSON.stringify(message);
    if (full && /https?:\/\/|www\./i.test(full)) parts.push(full);
  } catch {
    /* ignore */
  }
  return parts.join("\n");
}

export type ClassifiedMessage =
  | { action: "ignore" }
  | { action: "urls"; urls: string[] }
  | {
      action: "upload";
      messageType: UploadMessageType;
      fileName: string | null;
      fileSize: number | null;
      provider: "line" | "external";
      sourceUrl: string | null;
    };

export function extensionOf(fileName: string | null | undefined): string {
  if (!fileName) return "";
  const base = fileName.split(/[/\\]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  if (i <= 0 || i === base.length - 1) return "";
  return base.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** file uploads: only an allowlist is downloaded. image/video/audio are checked via Content-Type later. */
export function fileExtensionDecision(
  fileName: string | null,
): "download" | "blocked" | "not_allowed" {
  const ext = extensionOf(fileName);
  if (!ext) return "not_allowed";
  if (BLOCKED_FILE_EXT.has(ext)) return "blocked";
  if (!ALLOWED_FILE_EXT.has(ext)) return "not_allowed";
  return "download";
}

export function normalizeContentType(header: string | null | undefined): string {
  return (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isDangerousContentType(contentType: string): boolean {
  return DANGEROUS_CONTENT_TYPES.has(normalizeContentType(contentType));
}

const MESSAGE_FALLBACK: Record<UploadMessageType, string> = {
  image: "jpg",
  video: "mp4",
  audio: "m4a",
  file: "",
};

/**
 * Pick a file extension to write.
 * Known Content-Types win. application/octet-stream falls back to the
 * LINE message type, or to an allowlisted filename for type=file.
 */
export function chooseUploadExt(
  messageType: UploadMessageType,
  fileName: string | null,
  contentType: string,
): string | null {
  if (isDangerousContentType(contentType)) return null;
  const fromType = extForContentType(contentType);
  if (fromType) return fromType;
  const ct = normalizeContentType(contentType);
  if (ct !== "" && ct !== "application/octet-stream") return null;
  if (messageType === "file") {
    if (fileExtensionDecision(fileName) !== "download") return null;
    return extensionOf(fileName) || null;
  }
  return MESSAGE_FALLBACK[messageType] || null;
}

/** Map a response Content-Type to a safe extension, or null if we should not write the bytes. */
export function extForContentType(contentType: string): string | null {
  const ct = normalizeContentType(contentType);
  if (!ct || isDangerousContentType(ct)) return null;
  if (ct === "application/octet-stream") return null;
  return CONTENT_TYPE_EXT[ct] ?? null;
}

export function httpsUrlOrNull(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Keep a LINE message only when it contains at least one URL, or is an upload.
 * Plain text, stickers, and location are dropped. userId is never read.
 */
export function classifyMessage(message: LineIncomingMessage | undefined): ClassifiedMessage {
  const type = message?.type;
  if (!type) return { action: "ignore" };

  // text + flex/template preview cards (Facebook/LINE shares often land here)
  if (type === "text" || type === "flex" || type === "template") {
    const urls = extractUrls(messageUrlHaystack(message));
    if (!urls.length) return { action: "ignore" };
    return { action: "urls", urls };
  }

  if (!UPLOAD_SET.has(type)) return { action: "ignore" };

  const provider = message?.contentProvider?.type === "external" ? "external" : "line";
  return {
    action: "upload",
    messageType: type as UploadMessageType,
    fileName: message?.fileName ?? null,
    fileSize: typeof message?.fileSize === "number" ? message.fileSize : null,
    provider,
    sourceUrl: httpsUrlOrNull(message?.contentProvider?.originalContentUrl),
  };
}
