// src/server/benchmark/extractor-prompt.ts
export const EXTRACTOR_VERSION = "v1";

export function buildExtractorPrompt(args: {
  promptText: string;
  rawAnswer: string;
  knownBrands: Array<{
    slug: string;
    canonicalName: string;
    aliases: string[];
  }>;
}): string {
  const brandList = args.knownBrands
    .map(
      (b) =>
        `- ${b.canonicalName} [slug: ${b.slug}] aliases: ${b.aliases.join(", ") || "(none)"}`,
    )
    .join("\n");

  return `You are a brand-extraction assistant. Given an AI model's answer to a user prompt, identify every brand, product, or company name the answer mentions. Return ONLY JSON matching the schema below.

INPUT PROMPT:
${args.promptText}

MODEL ANSWER:
${args.rawAnswer}

KNOWN BRANDS IN THIS CATEGORY:
${brandList || "(none — this is a new category)"}

OUTPUT SCHEMA:
{
  "mentions": [
    {
      "rawMention": "string, exactly as written in the answer",
      "suggestedBrandSlug": "string | null, from the KNOWN BRANDS list above, or null if unknown",
      "rank": "number | null, 1-based if the answer is a ranked list",
      "sentiment": "positive" | "neutral" | "negative",
      "context": "short (<= 280 chars) snippet of the answer around the mention",
      "confidence": "number 0-1, how sure you are this is a real brand mention"
    }
  ]
}

RULES:
- Merge duplicate mentions of the same brand into one entry; use the first occurrence's rank.
- Only set suggestedBrandSlug if the rawMention clearly matches a known brand's canonical name or alias (case-insensitive).
- If the answer has no brand mentions, return {"mentions": []}.
- Do not invent brands. Do not include generic terms ("the database", "an editor").
- Output ONLY the JSON object. No prose, no markdown fencing.`;
}

export type ExtractorMention = {
  rawMention: string;
  suggestedBrandSlug: string | null;
  rank: number | null;
  sentiment: "positive" | "neutral" | "negative";
  context: string;
  confidence: number;
};

export type ExtractorResponse = {
  mentions: ExtractorMention[];
};
