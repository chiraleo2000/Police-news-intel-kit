import {
  chooseUploadExt,
  classifyMessage,
  extForContentType,
  extensionOf,
  fileExtensionDecision,
  httpsUrlOrNull,
  isDangerousContentType,
} from "./filter.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const plain = classifyMessage({ type: "text", text: "ประชุมพรุ่งนี้ 9 โมง" });
assert(plain.action === "ignore", "plain text dropped");

const urls = classifyMessage({
  type: "text",
  text: "ข่าว https://www.thairath.co.th/news/crime/1 และ https://example.com/a",
});
assert(urls.action === "urls" && urls.urls.length === 2, "urls kept");

const flex = classifyMessage({
  type: "flex",
  altText: "https://www.facebook.com/share/p/aaaa/",
  contents: { type: "bubble", action: { uri: "https://www.facebook.com/share/p/bbbb/" } },
});
assert(flex.action === "urls" && flex.urls.length === 2, "flex urls kept");

const sticker = classifyMessage({ type: "sticker", id: "1" });
assert(sticker.action === "ignore", "sticker dropped");

const file = classifyMessage({
  type: "file",
  id: "9",
  fileName: "report.pdf",
  fileSize: 1200,
});
assert(
  file.action === "upload" && file.messageType === "file" && file.provider === "line",
  "file kept",
);

const image = classifyMessage({
  type: "image",
  id: "8",
  contentProvider: {
    type: "external",
    originalContentUrl: "https://cdn.example.com/a.jpg",
    previewImageUrl: "https://cdn.example.com/a-prev.jpg",
  },
});
assert(
  image.action === "upload" &&
    image.provider === "external" &&
    image.sourceUrl === "https://cdn.example.com/a.jpg",
  "external image kept",
);

assert(fileExtensionDecision("note.pdf") === "download", "pdf allowed");
assert(fileExtensionDecision("run.exe") === "blocked", "exe blocked");
assert(fileExtensionDecision("noext") === "not_allowed", "missing ext");
assert(extensionOf("C:\\fake\\..\\a.PDF") === "pdf", "ext from basename");
assert(extForContentType("image/jpeg; charset=binary") === "jpg", "jpeg ext");
assert(extForContentType("application/octet-stream") === null, "octet-stream not guessed");
assert(isDangerousContentType("application/javascript"), "js blocked");
assert(httpsUrlOrNull("javascript:alert(1)") === null, "non-http dropped");
assert(chooseUploadExt("image", null, "image/jpeg") === "jpg", "image jpeg");
assert(chooseUploadExt("file", "brief.pdf", "application/octet-stream") === "pdf", "pdf octet");
assert(chooseUploadExt("file", "run.exe", "application/octet-stream") === null, "exe not written");
assert(chooseUploadExt("image", null, "text/html") === null, "html image rejected");

console.log("filter.test ok");
