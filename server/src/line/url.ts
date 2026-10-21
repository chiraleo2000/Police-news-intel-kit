import dns from "node:dns/promises";
import net from "node:net";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "si",
]);

const SHORT_HOSTS = new Set([
  "bit.ly",
  "t.co",
  "goo.gl",
  "tinyurl.com",
  "ow.ly",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
  "lnkd.in",
  "fb.me",
  "liff.line.me",
]);

/** Official / media / social domain hints (extend via env later). */
const OFFICIAL_SUFFIXES = [
  ".go.th",
  ".police.go.th",
  "royalthaipolice.go.th",
];

const MEDIA_HOSTS = new Set([
  "thairath.co.th",
  "matichon.co.th",
  "khaosod.co.th",
  "bangkokpost.com",
  "nationthailand.com",
  "thestandard.co",
  "pptvhd36.com",
  "workpointtoday.com",
  "thaipbs.or.th",
  "bbc.com",
  "reuters.com",
]);

const SOCIAL_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "fb.com",
  "fb.watch",
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "instagram.com",
  "www.instagram.com",
  "x.com",
  "twitter.com",
  "www.twitter.com",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "line.me",
  "page.line.me",
]);

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export type DomainType = "official" | "media" | "social" | "unknown";

export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  return [...new Set(found.map((u) => u.replace(/[.,;:!?)]+$/, "")))];
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function classifyDomain(hostname: string): {
  domain: string;
  domain_type: DomainType;
  fetchable: boolean;
} {
  const full = hostname.toLowerCase();
  const host = full.replace(/^www\./, "");

  if (
    SOCIAL_HOSTS.has(full) ||
    SOCIAL_HOSTS.has(host) ||
    SOCIAL_HOSTS.has(`www.${host}`)
  ) {
    return { domain: host, domain_type: "social", fetchable: false };
  }
  if (host.endsWith(".go.th") || host === "go.th" || OFFICIAL_SUFFIXES.some((s) => host.endsWith(s.replace(/^\./, "")) || full.endsWith(s))) {
    return { domain: host, domain_type: "official", fetchable: true };
  }
  if (MEDIA_HOSTS.has(host) || MEDIA_HOSTS.has(full)) {
    return { domain: host, domain_type: "media", fetchable: true };
  }
  return { domain: host || "unknown", domain_type: "unknown", fetchable: true };
}

export function stripTracking(url: string): string {
  try {
    const u = new URL(url);
    const keys = [...u.searchParams.keys()];
    for (const k of keys) {
      if (TRACKING_PARAMS.has(k.toLowerCase()) || k.toLowerCase().startsWith("utm_")) {
        u.searchParams.delete(k);
      }
    }
    u.hash = "";
    // normalize trailing slash (keep root /)
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function isPrivateIp(ip: string): boolean {
  if (net.isIP(ip) === 0) return true;
  if (ip === "127.0.0.1" || ip === "::1") return true;
  const parts = ip.split(".").map(Number);
  if (parts.length === 4) {
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  // IPv6 local / ULA rough
  const lower = ip.toLowerCase();
  if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) return true;
  return false;
}

export async function assertNotSsrf(url: string): Promise<void> {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("protocol_not_allowed");
  }
  if (u.username || u.password) {
    throw new Error("userinfo_not_allowed");
  }
  const host = u.hostname;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("ssrf_blocked_host");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("ssrf_blocked_ip");
    return;
  }
  let addrs: string[];
  try {
    const r = await dns.lookup(host, { all: true });
    addrs = r.map((x) => x.address);
  } catch {
    throw new Error("dns_failed");
  }
  for (const a of addrs) {
    if (isPrivateIp(a)) throw new Error("ssrf_blocked_resolved");
  }
}

const EXPAND_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 5;

export async function expandShortUrl(url: string): Promise<string> {
  let current = stripTracking(url);
  const host = hostnameOf(current);
  if (!SHORT_HOSTS.has(host) && !SHORT_HOSTS.has(host.replace(/^www\./, ""))) {
    return current;
  }

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    await assertNotSsrf(current);
    const ctrl = AbortSignal.timeout(EXPAND_TIMEOUT_MS);
    const res = await fetch(current, {
      method: "HEAD",
      redirect: "manual",
      signal: ctrl,
      headers: { "User-Agent": "news-hub-url-expand/0.2" },
    });
    const loc = res.headers.get("location");
    if (loc && res.status >= 300 && res.status < 400) {
      current = stripTracking(new URL(loc, current).toString());
      continue;
    }
    // some shortners ignore HEAD
    if (!loc && (res.status === 405 || res.status === 403)) {
      const res2 = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(EXPAND_TIMEOUT_MS),
        headers: { "User-Agent": "news-hub-url-expand/0.2" },
      });
      const loc2 = res2.headers.get("location");
      if (loc2 && res2.status >= 300 && res2.status < 400) {
        current = stripTracking(new URL(loc2, current).toString());
        continue;
      }
    }
    break;
  }
  await assertNotSsrf(current);
  return stripTracking(current);
}

export async function canonicalizeUrl(raw: string): Promise<{
  url: string;
  canonical_url: string;
  domain: string;
  domain_type: DomainType;
  fetchable: boolean;
}> {
  const cleaned = stripTracking(raw.trim());
  await assertNotSsrf(cleaned);
  let expanded = cleaned;
  try {
    expanded = await expandShortUrl(cleaned);
  } catch {
    expanded = cleaned;
  }
  const cls = classifyDomain(hostnameOf(expanded));
  return {
    url: raw.trim(),
    canonical_url: expanded,
    ...cls,
  };
}

/** ICT ISO-like local string YYYY-MM-DDTHH:mm:ss+07:00 */
export function nowIct(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+07:00`;
}

export function todayIct(): string {
  return nowIct().slice(0, 10);
}
