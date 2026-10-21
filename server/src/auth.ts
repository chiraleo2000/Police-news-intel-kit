import type { FastifyRequest, FastifyReply } from "fastify";
import { config } from "./config.js";

export type Actor = "claude" | "readonly" | "anonymous";

export function resolveActor(req: FastifyRequest): Actor {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return "anonymous";
  const token = h.slice(7).trim();
  if (token && token === config.apiTokenClaude) return "claude";
  if (token && token === config.apiTokenReadonly) return "readonly";
  return "anonymous";
}

export async function requireClaude(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const actor = resolveActor(req);
  if (actor !== "claude") {
    await reply.code(401).send({ error: "unauthorized" });
  }
}

export async function requireRead(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const actor = resolveActor(req);
  if (actor !== "claude" && actor !== "readonly") {
    await reply.code(401).send({ error: "unauthorized" });
  }
}
