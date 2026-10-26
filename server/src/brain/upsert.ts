import fs from "node:fs";
import path from "node:path";
import { vaultDir } from "./files.js";

export type BrainUpsertInput = {
  kind: "merge_proposal" | "entity_timeline" | "weekly_note";
  status?: string;
  keep?: string;
  merge?: string[];
  reason?: string;
  entity?: string;
  entries?: unknown[];
  week?: string;
  body?: string;
};

function safeWeek(week: string) {
  return week.replaceAll(/[^\dWw-]/g, "") || "unknown-week";
}

/** Append a review record. Weekly notes also land in vault/50_Trends. Does not delete or merge entities. */
export function brainUpsert(input: BrainUpsertInput) {
  const dir = path.join(vaultDir(), "_system");
  fs.mkdirSync(dir, { recursive: true });
  const record = { at: new Date().toISOString(), ...input };
  fs.appendFileSync(path.join(dir, "brain-reviews.jsonl"), `${JSON.stringify(record)}\n`, "utf8");

  if (input.kind === "weekly_note" && input.week) {
    const week = safeWeek(input.week);
    const trends = path.join(vaultDir(), "50_Trends");
    fs.mkdirSync(trends, { recursive: true });
    const body = input.body || "";
    fs.writeFileSync(
      path.join(trends, `${week}.md`),
      `---\ntype: weekly\ngenerated: true\nweek: "${week}"\n---\n\n${body}\n`,
      "utf8",
    );
  }
  return { ok: true, kind: input.kind };
}
