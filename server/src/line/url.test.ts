import {
  extractUrls,
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

console.log("url.test ok");
