import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { config, assertLineConfigured } from "./config.js";
import { getDb, listLineLinks, listLineFiles, listRecentNewLinks, markLineLinks, getRunStatus, putRunStatus, audit } from "./db/index.js";
import { verifyLineSignature } from "./line/signature.js";
import { processLineEvents } from "./line/process.js";
import { requireClaude, requireRead, resolveActor } from "./auth.js";
import { todayIct } from "./line/url.js";

function logWebhookRaw(raw: Buffer, ok: boolean) {
  try {
    const dir = path.resolve(config.exportPath, "..", "..", "logs");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "webhook-raw.log");
    const eventsFile = path.join(dir, "webhook-events.jsonl");
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
        const gid = typeof src.groupId === "string" ? src.groupId : typeof src.roomId === "string" ? src.roomId : "-";
        summary += ` | type=${ev.type} src=${src.type ?? "-"} group=${gid} msg=${msg.type ?? "-"} textLen=${text.length} altLen=${alt.length}`;
        if (text) summary += ` textPreview=${JSON.stringify(text.slice(0, 180))}`;
        // Compact trail for forensics when a URL is "missing" from Excel/JSON
        fs.appendFileSync(
          eventsFile,
          `${JSON.stringify({
            at: new Date().toISOString(),
            sig_ok: ok,
            type: ev.type,
            source_type: src.type ?? null,
            group_id: gid === "-" ? null : gid,
            message_type: msg.type ?? null,
            message_id: msg.id ?? null,
            text: text ? text.slice(0, 2000) : null,
            alt_text: alt ? alt.slice(0, 500) : null,
          })}\n`,
          "utf8",
        );
      }
    } catch {
      summary += " parse=fail";
    }
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

app.get("/health", async () => ({
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

app.get("/v1/line_files", { preHandler: requireRead }, async (req) => {
  const q = req.query as { date?: string };
  const date = q.date || todayIct();
  return { date, files: listLineFiles(date) };
});

app.get("/v1/line_links", { preHandler: requireRead }, async (req) => {
  const q = req.query as { date?: string; status?: string; days?: string };
  if (q.days) {
    const days = Math.min(30, Math.max(1, Number(q.days) || 1));
    return { links: listRecentNewLinks(days), mode: "recent_new" };
  }
  const date = q.date || todayIct();
  return { date, links: listLineLinks(date, q.status) };
});

app.post("/v1/line_links/mark", { preHandler: requireClaude }, async (req, reply) => {
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

app.get("/v1/run_status", { preHandler: requireRead }, async (req) => {
  const q = req.query as { task?: string };
  return getRunStatus(q.task || "task-2");
});

app.put("/v1/run_status", { preHandler: requireClaude }, async (req, reply) => {
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

app.get("/v1/registry", { preHandler: requireRead }, async () => {
  // Task-2 uses LINE only; registry endpoint reserved for Task-1 / future.
  return {
    note: "registry served from plugin/reference; use local files for Task-1",
    sources: [],
  };
});

/** Rewrite continuous Excel/JSON from the live DB (avoids second-process sqlite crash). */
app.post("/v1/export/continuous", { preHandler: requireClaude }, async (req) => {
  const { writeContinuousIntakeExcel } = await import("./export/continuous.js");
  const result = await writeContinuousIntakeExcel();
  audit(resolveActor(req), "export_continuous", JSON.stringify(result));
  return result;
});

/** Localhost-friendly export for scheduled tasks (no bearer required from 127.0.0.1). */
app.post("/v1/export/continuous/local", async (req, reply) => {
  const ip = req.ip || "";
  if (ip !== "127.0.0.1" && ip !== "::1" && ip !== ":ffff:127.0.0.1") {
    return reply.code(403).send({ error: "localhost_only" });
  }
  const { writeContinuousIntakeExcel } = await import("./export/continuous.js");
  return writeContinuousIntakeExcel();
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

const start = async () => {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`news-hub on :${config.port}`);
};

start().catch((err) => {
  logFatal("listen_failed", err);
  process.exit(1);
});
