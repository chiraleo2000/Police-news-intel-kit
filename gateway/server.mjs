// node gateway/server.mjs
// One listener. /1234 and /8787 are proxied to localhost; /7988 and any other port return 404.
import http from "node:http";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 8790;
const ALLOWED_PORTS = new Set(["1234", "8787"]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, ngrok-skip-browser-warning",
};

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

function listenPort() {
  const raw = process.env.PORT;
  if (raw === undefined || String(raw).trim() === "") return DEFAULT_PORT;
  const text = String(raw).trim();
  if (text === "7988") {
    console.error("Refusing to listen on port 7988");
    process.exit(1);
  }
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("Invalid PORT");
    process.exit(1);
  }
  return port;
}

function sendJson(res, status, body) {
  if (res.headersSent || res.writableEnded) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function routeOf(rawUrl) {
  const raw = rawUrl && rawUrl.startsWith("/") ? rawUrl : `/${rawUrl || ""}`;
  const queryAt = raw.indexOf("?");
  const pathname = queryAt === -1 ? raw : raw.slice(0, queryAt);
  const search = queryAt === -1 ? "" : raw.slice(queryAt);
  const match = /^\/(\d+)(\/.*)?$/.exec(pathname);
  if (!match || !ALLOWED_PORTS.has(match[1])) return null;
  const rest = match[2] && match[2].length > 0 ? match[2] : "/";
  return { port: Number(match[1]), path: `${rest}${search}` };
}

function forwardHeaders(req) {
  const headers = {};
  for (const name of ["authorization", "accept", "content-type", "content-length"]) {
    const value = req.headers[name];
    if (value !== undefined) headers[name] = value;
  }
  return headers;
}

function proxy(req, res, target) {
  const upstream = http.request(
    {
      hostname: HOST,
      port: target.port,
      method: req.method,
      path: target.path,
      headers: forwardHeaders(req),
    },
    (upstreamRes) => {
      const headers = { ...CORS_HEADERS };
      for (const [name, value] of Object.entries(upstreamRes.headers)) {
        const lower = name.toLowerCase();
        if (HOP_BY_HOP.has(lower) || lower.startsWith("access-control-")) continue;
        if (value !== undefined) headers[name] = value;
      }
      res.writeHead(upstreamRes.statusCode || 502, headers);
      upstreamRes.pipe(res);
    },
  );

  const fail = () => {
    if (res.headersSent || res.writableEnded) {
      res.destroy();
      return;
    }
    sendJson(res, 502, { error: "bad gateway" });
  };

  upstream.on("error", fail);
  req.on("error", () => upstream.destroy());
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
}

function handle(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const target = routeOf(req.url || "/");
  if (!target) {
    req.resume();
    sendJson(res, 404, { error: "not found" });
    return;
  }

  proxy(req, res, target);
}

const port = listenPort();
const server = http.createServer(handle);

server.on("error", (err) => {
  console.error(err.message);
  process.exit(1);
});

server.listen(port, HOST, () => {
  console.log(`listening on http://${HOST}:${port}`);
});
