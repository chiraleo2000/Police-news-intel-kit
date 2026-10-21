import { config } from "../config.js";
import {
  deleteByMessageId,
  insertLineLink,
  seenEvent,
  audit,
} from "../db/index.js";
import { canonicalizeUrl, extractUrls, nowIct } from "./url.js";

type LineEvent = {
  type: string;
  webhookEventId?: string;
  timestamp?: number;
  source?: { type?: string; groupId?: string; userId?: string; roomId?: string };
  message?: { type?: string; id?: string; text?: string };
  unsend?: { messageId?: string };
};

function groupAlias(groupId: string | undefined): string | null {
  if (!groupId) return null;
  if (
    config.lineAllowedGroupIds.length > 0 &&
    !config.lineAllowedGroupIds.includes(groupId)
  ) {
    return null;
  }
  return config.lineGroupAliases[groupId] ?? `group_${groupId.slice(0, 8)}`;
}

export async function processLineEvents(events: LineEvent[]): Promise<void> {
  for (const ev of events) {
    const eventId = ev.webhookEventId ?? null;
    if (eventId && seenEvent(eventId)) continue;

    if (ev.type === "join" || ev.type === "memberJoined") {
      const gid = ev.source?.groupId ?? ev.source?.roomId;
      audit("line-webhook", "join", `groupId=${gid ?? "?"} — add to LINE_ALLOWED_GROUP_IDS`);
      continue;
    }

    if (ev.type === "unsend" && ev.unsend?.messageId) {
      const n = deleteByMessageId(ev.unsend.messageId);
      audit("line-webhook", "unsend", `messageId=${ev.unsend.messageId} deleted=${n}`);
      continue;
    }

    if (ev.type !== "message" || ev.message?.type !== "text") continue;
    if (ev.source?.type !== "group" && ev.source?.type !== "room") continue;

    const groupId = ev.source.groupId ?? ev.source.roomId;
    const alias = groupAlias(groupId);
    if (!alias) {
      audit("line-webhook", "reject_group", `groupId=${groupId ?? "?"}`);
      continue;
    }

    const text = ev.message.text ?? "";
    const urls = extractUrls(text);
    if (!urls.length) continue;

    const receivedAt = nowIct();
    for (const raw of urls) {
      try {
        const c = await canonicalizeUrl(raw);
        const r = insertLineLink({
          eventId: eventId ? `${eventId}:${c.canonical_url}` : null,
          lineMessageId: ev.message.id ?? null,
          receivedAt,
          groupAlias: alias,
          url: c.url,
          canonicalUrl: c.canonical_url,
          domain: c.domain,
          domainType: c.domain_type,
          fetchable: c.fetchable,
        });
        if (r.inserted) {
          audit("line-webhook", "link_insert", `id=${r.id} ${c.canonical_url}`);
        }
      } catch (err) {
        audit(
          "line-webhook",
          "link_skip",
          `${raw} err=${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
