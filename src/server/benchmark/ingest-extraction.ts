// src/server/benchmark/ingest-extraction.ts
import type { ExtractorMention } from "./extractor-prompt";

export type ResolvedMention = {
  rawMention: string;
  brandId: string;
  rank: number | null;
  sentiment: ExtractorMention["sentiment"];
  context: string;
  confidence: number;
};

export type UnresolvedMention = {
  rawMention: string;
  suggestedBrandId: string | null;
  rank: number | null;
  sentiment: ExtractorMention["sentiment"];
  context: string;
  confidence: number;
};

export function splitMentions(
  mentions: ExtractorMention[],
  brandsByKey: Map<string, { id: string; slug: string }>,
): { resolved: ResolvedMention[]; unresolved: UnresolvedMention[] } {
  const resolved: ResolvedMention[] = [];
  const unresolved: UnresolvedMention[] = [];

  for (const m of mentions) {
    const keys = [
      m.suggestedBrandSlug?.toLowerCase() ?? "",
      m.rawMention.trim().toLowerCase(),
    ].filter(Boolean);
    const hit = keys.map((k) => brandsByKey.get(k)).find(Boolean);
    if (hit) {
      resolved.push({
        rawMention: m.rawMention,
        brandId: hit.id,
        rank: m.rank,
        sentiment: m.sentiment,
        context: m.context,
        confidence: m.confidence,
      });
    } else {
      unresolved.push({
        rawMention: m.rawMention,
        suggestedBrandId: null,
        rank: m.rank,
        sentiment: m.sentiment,
        context: m.context,
        confidence: m.confidence,
      });
    }
  }
  return { resolved, unresolved };
}
