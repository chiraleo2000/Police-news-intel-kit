import { createRequire } from "node:module";
import type { PostV2 } from "./enrich.js";

const require = createRequire(import.meta.url);

export type ExtractedEntity = {
  name: string;
  group: "บุคคล" | "ผู้ต้องหา" | "บัญชี" | "หน่วย" | "สถานที่" | "ข่ายเครือข่าย";
  rel: string;
};

const graphEntities = require("../../../ops/graph-entities.js") as {
  extractPostEntities: (post: PostV2) => ExtractedEntity[];
  thaiLabel: (raw: string) => string;
  isSpecificNetwork: (name: string) => boolean;
  looksLikeUnit: (title: string) => boolean;
};

export function extractPostEntities(post: PostV2): ExtractedEntity[] {
  return graphEntities.extractPostEntities(post);
}

export function thaiLabel(raw: string): string {
  return graphEntities.thaiLabel(raw);
}

export function isSpecificNetwork(name: string): boolean {
  return graphEntities.isSpecificNetwork(name);
}

export function looksLikeUnit(title: string): boolean {
  return graphEntities.looksLikeUnit(title);
}
