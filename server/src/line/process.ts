import { config } from "../config.js";
import {
  deleteByMessageId,
  insertLineFile,
  insertLineLink,
  seenEvent,
  audit,
} from "../db/index.js";
import { fetchLineMessageContent, writeUploadFile } from "./content.js";
import {
  chooseUploadExt,
  classifyMessage,
  fileExtensionDecision,
  isDangerousContentType,
  type UploadMessageType,
} from "./filter.js";
import { canonicalizeUrl, nowIct } from "./url.js";

type LineEvent = {
  type: string;
  webhookEventId?: string;
  timestamp?: number;
  source?: { type?: string; groupId?: string; userId?: string; roomId?: string };
  message?: {
    type?: string;
    id?: string;
    text?: string;
    altText?: string;
    title?: string;
    contents?: unknown;
    fileName?: string;
    fileSize?: number;
    contentProvider?: {
      type?: string;
      originalContentUrl?: string;
      previewImageUrl?: string;
    };
  };
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

function uploadSkipReason(input: {
  messageType: UploadMessageType;
  fileName: string | null;
  fileSize: number | null;
  provider: "line" | "external";
}): string | null {
  if (input.fileSize != null && input.fileSize > config.lineFileMaxBytes) {
    return "too_large";
  }
  if (input.messageType === "file") {
    const decision = fileExtensionDecision(input.fileName);
    if (decision === "blocked") return "extension_blocked";
    if (decision === "not_allowed") return "extension_not_allowed";
  }
  if (input.provider === "external") return "external_content";
  if (!config.lineChannelAccessToken) return "no_access_token";
  return null;
}

export async function processLineEvents(events: LineEvent[]): Promise<void> {
  audit("line-webhook", "batch", `events=${events.length}`);
  for (const ev of events) {
    const eventId = ev.webhookEventId ?? null;
    if (eventId && seenEvent(eventId)) {
      audit("line-webhook", "dup_event", `eventId=${eventId}`);
      continue;
    }

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

    if (ev.type !== "message") {
      audit("line-webhook", "skip_event", `type=${ev.type}`);
      continue;
    }
    if (ev.source?.type !== "group" && ev.source?.type !== "room") {
      audit("line-webhook", "skip_source", `source=${ev.source?.type ?? "?"}`);
      continue;
    }

    const groupId = ev.source.groupId ?? ev.source.roomId;
    const alias = groupAlias(groupId);
    if (!alias) {
      audit("line-webhook", "reject_group", `groupId=${groupId ?? "?"}`);
      continue;
    }

    const classified = classifyMessage(ev.message);
    if (classified.action === "ignore") {
      const preview = (ev.message?.text ?? ev.message?.altText ?? "").slice(0, 80);
      audit(
        "line-webhook",
        "skip_message",
        `group=${alias} groupId=${groupId ?? "?"} msgType=${ev.message?.type ?? "?"} no_url_or_upload preview=${JSON.stringify(preview)}`,
      );
      continue;
    }

    const receivedAt = nowIct();
    if (classified.action === "urls") {
      audit(
        "line-webhook",
        "urls_found",
        `msgType=${ev.message?.type ?? "?"} count=${classified.urls.length}`,
      );
      for (const raw of classified.urls) {
        try {
          const c = await canonicalizeUrl(raw);
          const r = insertLineLink({
            eventId: eventId ? `${eventId}:${c.canonical_url}` : null,
            lineMessageId: ev.message?.id ?? null,
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
          } else {
            audit(
              "line-webhook",
              "link_dup",
              `${c.canonical_url} reason=${r.reason ?? "duplicate"}`,
            );
          }
        } catch (err) {
          audit(
            "line-webhook",
            "link_skip",
            `${raw} err=${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      continue;
    }

    const messageId = ev.message?.id ?? null;
    const skip = uploadSkipReason(classified);
    if (skip || !messageId) {
      const r = insertLineFile({
        eventId,
        lineMessageId: messageId,
        receivedAt,
        groupAlias: alias,
        messageType: classified.messageType,
        fileName: classified.fileName,
        fileSize: classified.fileSize,
        contentProvider: classified.provider,
        sourceUrl: classified.sourceUrl,
        status: "metadata_only",
        reason: skip ?? "missing_message_id",
      });
      if (r.inserted) {
        audit(
          "line-webhook",
          "file_meta",
          `type=${classified.messageType} reason=${skip ?? "missing_message_id"}`,
        );
      }
      continue;
    }

    try {
      const downloaded = await fetchLineMessageContent(messageId);
      const blocked = isDangerousContentType(downloaded.contentType);
      const ext = blocked
        ? null
        : chooseUploadExt(classified.messageType, classified.fileName, downloaded.contentType);
      if (!ext) {
        insertLineFile({
          eventId,
          lineMessageId: messageId,
          receivedAt,
          groupAlias: alias,
          messageType: classified.messageType,
          fileName: classified.fileName,
          fileSize: downloaded.body.length,
          contentProvider: "line",
          status: "metadata_only",
          reason: blocked ? "content_type_blocked" : "unknown_type",
        });
        audit(
          "line-webhook",
          "file_skip",
          `type=${classified.messageType} reason=${blocked ? "content_type_blocked" : "unknown_type"}`,
        );
        continue;
      }

      const storedPath = writeUploadFile(receivedAt.slice(0, 10), messageId, ext, downloaded.body);
      const r = insertLineFile({
        eventId,
        lineMessageId: messageId,
        receivedAt,
        groupAlias: alias,
        messageType: classified.messageType,
        fileName: classified.fileName,
        fileSize: downloaded.body.length,
        contentProvider: "line",
        storedPath,
        status: "saved",
      });
      if (r.inserted) {
        audit(
          "line-webhook",
          "file_saved",
          `type=${classified.messageType} bytes=${downloaded.body.length}`,
        );
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      insertLineFile({
        eventId,
        lineMessageId: messageId,
        receivedAt,
        groupAlias: alias,
        messageType: classified.messageType,
        fileName: classified.fileName,
        fileSize: classified.fileSize,
        contentProvider: "line",
        sourceUrl: classified.sourceUrl,
        status: "failed",
        reason,
      });
      audit("line-webhook", "file_failed", `type=${classified.messageType} err=${reason}`);
    }
  }

  // Keep the continuous Excel in sync after each webhook batch (URLs + uploads only).
  if (process.env.SKIP_CONTINUOUS_EXPORT === "1") return;
  try {
    const { writeContinuousIntakeExcel } = await import("../export/continuous.js");
    await writeContinuousIntakeExcel();
  } catch (err) {
    audit(
      "line-webhook",
      "continuous_export_fail",
      err instanceof Error ? err.message : String(err),
    );
  }
}
