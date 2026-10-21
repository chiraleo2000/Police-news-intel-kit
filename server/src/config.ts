import "dotenv/config";
import path from "node:path";

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing env ${name}`);
  }
  return v;
}

function opt(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

const home = opt("NEWSINTEL_HOME", process.cwd());

export const config = {
  port: Number(opt("PORT", "8080")),
  tz: opt("TZ", "Asia/Bangkok"),
  publicBaseUrl: opt("PUBLIC_BASE_URL", "http://localhost:8080"),
  dbPath: opt("DB_PATH", path.join(home, "data", "newshub.sqlite")),
  exportPath: opt("EXPORT_PATH", path.join(home, "exports")),
  vaultPath: opt("VAULT_PATH", path.join(home, "vault")),
  backupPath: opt("BACKUP_PATH", path.join(home, "backup")),
  lineChannelSecret: opt("LINE_CHANNEL_SECRET"),
  lineAllowedGroupIds: opt("LINE_ALLOWED_GROUP_IDS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  lineGroupAliases: Object.fromEntries(
    opt("LINE_GROUP_ALIASES")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        if (i < 0) return [p, p];
        return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
      }),
  ) as Record<string, string>,
  apiTokenClaude: opt("API_TOKEN_CLAUDE", "dev-claude-token-change-me"),
  apiTokenReadonly: opt("API_TOKEN_READONLY", "dev-readonly-token-change-me"),
  retentionLinksDays: Number(opt("RETENTION_LINKS_DAYS", "30")),
  newshubUrl: opt("NEWSHUB_URL", "http://127.0.0.1:8080"),
};

/** Soft load for jobs/mcp that only need paths — don't throw on missing LINE secret. */
export function loadConfigSoft() {
  return config;
}

export function assertLineConfigured() {
  if (!config.lineChannelSecret) {
    throw new Error("LINE_CHANNEL_SECRET is required for webhook");
  }
}
