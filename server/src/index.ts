import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { config, assertLineConfigured } from "./config.js";
import { getDb, listLineLinks, listRecentNewLinks, markLineLinks, getRunStatus, putRunStatus, audit } from "./db/index.js";
import { verifyLineSignature } from "./line/signature.js";
import { processLineEvents } from "./line/process.js";
import { requireClaude, requireRead, resolveActor } from "./auth.js";
import { todayIct } from "./line/url.js";

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
  if (!verifyLineSignature(config.lineChannelSecret, raw, sig)) {
    return reply.code(401).send({ error: "invalid_signature" });
  }

  const body = req.body as { events?: unknown[] };
  const events = Array.isArray(body?.events) ? body.events : [];

  void reply.code(200).send({ ok: true });

  if (!events.length) return;

  setImmediate(() => {
    processLineEvents(events as Parameters<typeof processLineEvents>[0]).catch(
      (err) => app.log.error({ err }, "line process failed"),
    );
  });
}

app.post("/line/webhook", handleLineWebhook);
app.post("/webhook/line", handleLineWebhook);

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

const start = async () => {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`news-hub on :${config.port}`);
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
