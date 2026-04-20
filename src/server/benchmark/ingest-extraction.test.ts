// src/server/benchmark/ingest-extraction.test.ts
import { describe, expect, it } from "vitest";
import { splitMentions } from "./ingest-extraction";

describe("splitMentions", () => {
  it("splits into resolved + queue based on brand lookup", () => {
    const brandsByKey = new Map<string, { id: string; slug: string }>([
      ["openai", { id: "b1", slug: "openai" }],
      ["chatgpt", { id: "b1", slug: "openai" }],
    ]);
    const result = splitMentions(
      [
        { rawMention: "ChatGPT", suggestedBrandSlug: "openai", rank: 1, sentiment: "positive", context: "c", confidence: 0.9 },
        { rawMention: "WeirdTool", suggestedBrandSlug: null, rank: 2, sentiment: "neutral", context: "c", confidence: 0.4 },
      ],
      brandsByKey,
    );
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]!.brandId).toBe("b1");
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]!.rawMention).toBe("WeirdTool");
  });
});
