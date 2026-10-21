import { getDb, insertLineLink, listLineLinks } from "../db/index.js";
import { canonicalizeUrl, nowIct } from "../line/url.js";

async function main() {
  getDb();
  const c = await canonicalizeUrl(
    "https://www.thairath.co.th/news/local/123?utm_source=line&fbclid=abc",
  );
  const r = insertLineLink({
    receivedAt: nowIct(),
    groupAlias: "smoke",
    url: c.url,
    canonicalUrl: c.canonical_url,
    domain: c.domain,
    domainType: c.domain_type,
    fetchable: c.fetchable,
  });
  const date = nowIct().slice(0, 10);
  console.log(
    JSON.stringify(
      { insert: r, canonical: c.canonical_url, listed: listLineLinks(date).length },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
