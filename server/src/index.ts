import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { config, assertLineConfigured } from "./config.js";
import { getDb, listLineLinks, listLineFiles, listRecentNewLinks, markLineLinks, getRunStatus, putRunStatus, audit } from "./db/index.js";
import { verifyLineSignature } from "./line/signature.js";
import { processLineEvents } from "./line/process.js";
import { requireClaude, requireRead, resolveActor } from "./auth.js";
import { todayIct } from "./line/url.js";

function asPlainString(v: unknown, fallback = "-"): string {
  return typeof v === "string" && v ? v : fallback;
}

function groupIdOf(src: Record<string, unknown>): string {
  if (typeof src.groupId === "string") return src.groupId;
  if (typeof src.roomId === "string") return src.roomId;
  return "-";
}

type WebhookEventLog = {
  eventsFile: string;
  ok: boolean;
  ev: Record<string, unknown>;
  src: Record<string, unknown>;
  msg: Record<string, unknown>;
  gid: string;
  text: string;
  alt: string;
};

function appendWebhookEvent(entry: WebhookEventLog) {
  const { eventsFile, ok, ev, src, msg, gid, text, alt } = entry;
  fs.appendFileSync(
    eventsFile,
    `${JSON.stringify({
      at: new Date().toISOString(),
      sig_ok: ok,
      type: ev.type,
      source_type: typeof src.type === "string" ? src.type : null,
      group_id: gid === "-" ? null : gid,
      message_type: typeof msg.type === "string" ? msg.type : null,
      message_id: msg.id ?? null,
      text: text ? text.slice(0, 2000) : null,
      alt_text: alt ? alt.slice(0, 500) : null,
    })}\n`,
    "utf8",
  );
}

function summarizeWebhookEvents(
  raw: Buffer,
  ok: boolean,
  eventsFile: string,
): string {
  let summary = `ok=${ok} bytes=${raw.length}`;
  try {
    const j = JSON.parse(raw.toString("utf8")) as { events?: Array<Record<string, unknown>> };
    const evs = Array.isArray(j.events) ? j.events : [];
    summary += ` events=${evs.length}`;
    for (const ev of evs.slice(0, 20)) {
      const msg = (ev.message ?? {}) as Record<string, unknown>;
      const src = (ev.source ?? {}) as Record<string, unknown>;
      const text = typeof msg.text === "string" ? msg.text : "";
      const alt = typeof msg.altText === "string" ? msg.altText : "";
      const gid = groupIdOf(src);
      const srcType = asPlainString(src.type);
      const msgType = asPlainString(msg.type);
      summary += ` | type=${ev.type} src=${srcType} group=${gid} msg=${msgType} textLen=${text.length} altLen=${alt.length}`;
      if (text) summary += ` textPreview=${JSON.stringify(text.slice(0, 180))}`;
      appendWebhookEvent({ eventsFile, ok, ev, src, msg, gid, text, alt });
    }
  } catch {
    summary += " parse=fail";
  }
  return summary;
}

function logWebhookRaw(raw: Buffer, ok: boolean) {
  try {
    const dir = path.resolve(config.exportPath, "..", "..", "logs");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "webhook-raw.log");
    const eventsFile = path.join(dir, "webhook-events.jsonl");
    const summary = summarizeWebhookEvents(raw, ok, eventsFile);
    fs.appendFileSync(file, `${new Date().toISOString()} ${summary}\n`, "utf8");
  } catch {
    /* ignore logging failures */
  }
}

type ReqWithRaw = FastifyRequest & { rawBody?: Buffer };

const app = Fastify({
  logger: true,
  bodyLimit: 1_048_576,
});

app.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (req, body, done) => {
    (req as ReqWithRaw).rawBody = body as Buffer;
    try {
      const json = body.length ? JSON.parse((body as Buffer).toString("utf8")) : {};
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  },
);

getDb();

app.get("/health", () => ({
  ok: true,
  service: "news-hub",
  today_ict: todayIct(),
}));

/** LINE Messaging API webhook — respond 200 ASAP, process async. */
async function handleLineWebhook(req: FastifyRequest, reply: FastifyReply) {
  try {
    assertLineConfigured();
  } catch {
    return reply.code(503).send({ error: "line_not_configured" });
  }

  const raw = (req as ReqWithRaw).rawBody ?? Buffer.from("");
  const sig = req.headers["x-line-signature"] as string | undefined;
  const sigOk = verifyLineSignature(config.lineChannelSecret, raw, sig);
  logWebhookRaw(raw, sigOk);
  if (!sigOk) {
    return reply.code(401).send({ error: "invalid_signature" });
  }

  const body = req.body as { events?: unknown[] };
  const events = Array.isArray(body?.events) ? body.events : [];

  void reply.code(200).send({ ok: true });

  if (!events.length) return;

  // Process in the same tick chain so bursts of group shares are not dropped
  // if the process exits right after setImmediate scheduling.
  void processLineEvents(events as Parameters<typeof processLineEvents>[0]).catch(
    (err) => app.log.error({ err }, "line process failed"),
  );
}

app.post("/line/webhook", handleLineWebhook);
app.post("/webhook/line", handleLineWebhook);

app.get("/v1/line_files", { preHandler: requireRead }, (req) => {
  const q = req.query as { date?: string };
  const date = q.date || todayIct();
  return { date, files: listLineFiles(date) };
});

app.get("/v1/line_links", { preHandler: requireRead }, (req) => {
  const q = req.query as { date?: string; status?: string; days?: string };
  if (q.days) {
    const days = Math.min(30, Math.max(1, Number(q.days) || 1));
    return { links: listRecentNewLinks(days), mode: "recent_new" };
  }
  const date = q.date || todayIct();
  return { date, links: listLineLinks(date, q.status) };
});

app.post("/v1/line_links/mark", { preHandler: requireClaude }, (req, reply) => {
  const body = req.body as {
    ids?: number[];
    status?: "used" | "skipped";
    article_id?: string;
    reason?: string;
  };
  if (!body?.ids?.length || !body.status) {
    return reply.code(400).send({ error: "ids_and_status_required" });
  }
  const n = markLineLinks(body.ids, body.status, body.article_id, body.reason);
  audit(resolveActor(req), "line_links_mark", JSON.stringify(body));
  return { updated: n };
});

app.get("/v1/run_status", { preHandler: requireRead }, (req) => {
  const q = req.query as { task?: string };
  return getRunStatus(q.task || "task-2");
});

app.put("/v1/run_status", { preHandler: requireClaude }, (req, reply) => {
  const body = req.body as {
    task?: string;
    run_date?: string;
    status?: string;
    counts?: unknown;
    issues?: unknown;
  };
  if (!body?.task || !body.run_date || !body.status) {
    return reply.code(400).send({ error: "task_run_date_status_required" });
  }
  putRunStatus({
    task: body.task,
    run_date: body.run_date,
    status: body.status,
    counts_json: body.counts ? JSON.stringify(body.counts) : undefined,
    issues_json: body.issues ? JSON.stringify(body.issues) : undefined,
  });
  return { ok: true };
});

app.get("/v1/registry", { preHandler: requireRead }, () => {
  // Task-2 uses LINE only; registry endpoint reserved for Task-1 / future.
  return {
    note: "registry served from plugin/reference; use local files for Task-1",
    sources: [],
  };
});

const IPV4_MAPPED_PREFIX = "::ffff:";

function isLoopbackAddress(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (!ip.startsWith(IPV4_MAPPED_PREFIX)) return false;
  return isLoopbackAddress(ip.slice(IPV4_MAPPED_PREFIX.length));
}

function isLocal(req: FastifyRequest) {
  return isLoopbackAddress(req.ip || "");
}

async function allowReadOrLocal(req: FastifyRequest, reply: FastifyReply) {
  if (isLocal(req)) return;
  await requireRead(req, reply);
}

app.get("/v1/brain/search", { preHandler: allowReadOrLocal }, async (req) => {
  const q = req.query as { q?: string; type?: string; limit?: string };
  const query = (q.q || "").trim();
  if (!query) return { query: "", cases: [], entities: [] };
  const { searchBrain } = await import("./brain/store.js");
  return searchBrain(query, q.type, Number(q.limit) || 30);
});

app.get("/v1/brain/timeline", { preHandler: allowReadOrLocal }, async (req) => {
  const q = req.query as { since?: string; until?: string; bureau?: string; crime_type?: string };
  const since = q.since || "1970-01-01";
  const until = q.until || "2999-12-31";
  const { timelineBrain } = await import("./brain/store.js");
  return timelineBrain(since, until, q.bureau, q.crime_type);
});
/** Rewrite continuous Excel/JSON from the live DB (avoids second-process sqlite crash). */
app.post("/v1/export/continuous", { preHandler: requireClaude }, async (req) => {
  const { writeContinuousIntakeExcel } = await import("./export/continuous.js");
  const result = await writeContinuousIntakeExcel();
  audit(resolveActor(req), "export_continuous", JSON.stringify(result));
  return result;
});

/** Localhost-friendly export for scheduled tasks (no bearer required from loopback). */
app.post("/v1/export/continuous/local", async (req, reply) => {
  if (!isLoopbackAddress(req.ip || "")) {
    return reply.code(403).send({ error: "localhost_only" });
  }
  try {
    const { writeContinuousIntakeExcel } = await import("./export/continuous.js");
    return await writeContinuousIntakeExcel();
  } catch (err) {
    logFatal("export_failed", err);
    return reply.code(500).send({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

function logFatal(kind: string, err: unknown) {
  try {
    const dir = path.resolve(config.exportPath, "..", "..", "logs");
    fs.mkdirSync(dir, { recursive: true });
    const line = `${new Date().toISOString()} ${kind} ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`;
    fs.appendFileSync(path.join(dir, "server.err.log"), line, "utf8");
  } catch {
    /* ignore */
  }
  console.error(kind, err);
}

process.on("uncaughtException", (err) => {
  logFatal("uncaughtException", err);
});
process.on("unhandledRejection", (err) => {
  logFatal("unhandledRejection", err);
});

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`news-hub on :${config.port}`);
} catch (err) {
  logFatal("listen_failed", err);
  console.error(err);
  process.exitCode = 1;
}
