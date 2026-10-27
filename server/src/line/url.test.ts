import {
  extractUrls,
  stripLineUrlJunk,
  stripTracking,
  classifyDomain,
  hostnameOf,
} from "./url.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const urls = extractUrls("ดู https://bit.ly/abc และ https://www.thairath.co.th/news/1?utm_source=x");
assert(urls.length === 2, "extract 2 urls");

const four = extractUrls(
  [
    "https://www.facebook.com/share/p/1GiXT4YLe9/",
    "https://www.facebook.com/share/p/2AbCdEfGhI/",
    "www.thairath.co.th/news/1",
    "https://www.matichon.co.th/news/2",
  ].join("\n"),
);
assert(four.length === 4, `extract 4 urls got ${four.length}`);
assert(four.some((u) => u.startsWith("https://www.thairath")), "www. upgraded to https");

const cleaned = stripTracking("https://x.com/a?utm_source=t&fbclid=1&q=2");
assert(!cleaned.includes("utm_"), "strip utm");
assert(!cleaned.includes("fbclid"), "strip fbclid");
assert(cleaned.includes("q=2"), "keep q");

assert(classifyDomain("royalthaipolice.go.th").domain_type === "official", "official");
assert(classifyDomain("facebook.com").fetchable === false, "social not fetchable");
assert(classifyDomain("thairath.co.th").domain_type === "media", "media");

assert(hostnameOf("https://WWW.Example.COM/x") === "www.example.com", "host");

const glued = extractUrls(
  "https://policetv.tv/archives/56020\\n\\n*2\nhttps://www.naewna.com/n/breaking/131252/\\n\\n*4",
);
assert(glued.length === 2, `extract glued newlines got ${glued.length}`);
assert(glued[0] === "https://policetv.tv/archives/56020", `strip literal newline tail ${glued[0]}`);
assert(
  glued[1] === "https://www.naewna.com/n/breaking/131252/",
  `keep real /n/ path ${glued[1]}`,
);
assert(
  stripLineUrlJunk("https://dailynews.co.th/news/6306450/n/n*3") ===
    "https://dailynews.co.th/news/6306450",
  "strip canonical /n/n tail",
);
assert(
  stripLineUrlJunk("https://www.bangkokbiznews.com/news/news-update/1257392/n*2") ===
    "https://www.bangkokbiznews.com/news/news-update/1257392",
  "strip single /n*2 tail",
);
assert(
  stripLineUrlJunk("https://www.cops-magazine.com/topic/158199//n*3") ===
    "https://www.cops-magazine.com/topic/158199",
  "strip //n*3 tail",
);
assert(
  stripLineUrlJunk("https://www.dailynews.co.th/news/6295867//n") ===
    "https://www.dailynews.co.th/news/6295867",
  "strip //n tail",
);
assert(
  stripLineUrlJunk("https://www.naewna.com/n/breaking/131252") ===
    "https://www.naewna.com/n/breaking/131252",
  "keep a real /n/ path",
);

console.log("url.test ok");
