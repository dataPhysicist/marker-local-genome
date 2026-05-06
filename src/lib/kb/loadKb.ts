import raw from "../../data/kb.json";
import { knowledgeBaseSchema, type KnowledgeBase } from "./schema";

let cached: KnowledgeBase | null = null;

export function loadKb(): KnowledgeBase {
  if (cached) return cached;
  cached = knowledgeBaseSchema.parse(raw);
  return cached;
}

export function kbVersion(): number {
  return loadKb().version;
}
