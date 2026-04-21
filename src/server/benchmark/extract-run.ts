// src/server/benchmark/extract-run.ts
//
// Shared extraction pipeline used by both the inline hook from submitRun
// (fire-and-forget via Next.js `after()`) and the dev-extract-run CLI.
// Writes brand mentions, auto-creates unknown brands, flips extraction_status.

import { and, eq, sql } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import {
  benchmarkBrandMentions,
  benchmarkPrompts,
  benchmarkRuns,
  brands,
} from "@/server/db/schema";
import { slugifyBrandName } from "@/server/benchmark/slugify";

type DB = typeof _db;

type ExtractorMention = {
  rawMention: string;
  suggestedBrandSlug: string | null;
  rank: number | null;
  sentiment: "positive" | "neutral" | "negative";
  context: string;
  confidence: number;
};

const EXTRACTOR_VERSION = "v1-openrouter";

export async function extractRunInline(db: DB, runId: string): Promise<void> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) {
    console.error(
      `[extract-run] OPENROUTER_API_KEY missing — marking run ${runId} failed.`,
    );
    await db
      .update(benchmarkRuns)
      .set({ extractionStatus: "failed" })
      .where(eq(benchmarkRuns.id, runId));
    return;
  }
  const model = process.env.EXTRACTOR_MODEL ?? "moonshotai/kimi-k2.5";

  const [run] = await db
    .select({
      id: benchmarkRuns.id,
      promptId: benchmarkRuns.promptId,
      rawAnswer: benchmarkRuns.rawAnswer,
      extractionAttempts: benchmarkRuns.extractionAttempts,
    })
    .from(benchmarkRuns)
    .where(eq(benchmarkRuns.id, runId))
    .limit(1);
  if (!run) {
    console.error(`[extract-run] run ${runId} not found`);
    return;
  }

  const [prompt] = await db
    .select({
      text: benchmarkPrompts.text,
      categoryId: benchmarkPrompts.categoryId,
    })
    .from(benchmarkPrompts)
    .where(eq(benchmarkPrompts.id, run.promptId))
    .limit(1);
  if (!prompt) {
    console.error(`[extract-run] prompt for run ${runId} not found`);
    return;
  }

  const knownBrands = await db
    .select({
      id: brands.id,
      slug: brands.slug,
      canonicalName: brands.canonicalName,
      aliases: brands.aliases,
    })
    .from(brands)
    .where(sql`${prompt.categoryId} = ANY(${brands.categoryIds})`);

  await db
    .update(benchmarkRuns)
    .set({ extractionStatus: "processing" })
    .where(eq(benchmarkRuns.id, runId));

  try {
    const brandList = knownBrands
      .map(
        (b) =>
          `- ${b.canonicalName} [slug: ${b.slug}] aliases: ${(b.aliases ?? []).join(", ") || "(none)"}`,
      )
      .join("\n");

    const rendered = `You are a brand-extraction assistant. Given an AI model's answer to a user prompt, identify every brand, product, or company name the answer mentions. Return ONLY JSON matching the schema below.

INPUT PROMPT:
${prompt.text}

MODEL ANSWER:
${run.rawAnswer}

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

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openrouterKey}`,
        "HTTP-Referer": "https://aitcommunity.org",
        "X-Title": "AIT Benchmark Extractor",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: rendered }],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
    if (!resp.ok) {
      throw new Error(`OpenRouter ${resp.status}: ${await resp.text()}`);
    }
    const body = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content;
    if (!text)
      throw new Error(`Empty OpenRouter response: ${JSON.stringify(body)}`);

    const parsed = JSON.parse(text) as { mentions: ExtractorMention[] };

    const bySlug = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const b of knownBrands) {
      bySlug.set(b.slug.toLowerCase(), b.id);
      byName.set(b.canonicalName.toLowerCase(), b.id);
      for (const a of b.aliases ?? []) byName.set(a.toLowerCase(), b.id);
    }

    const nameToBrandId = new Map<string, string>();

    for (const m of parsed.mentions) {
      const slugHit = m.suggestedBrandSlug
        ? bySlug.get(m.suggestedBrandSlug.toLowerCase())
        : undefined;
      const nameHit = byName.get(m.rawMention.trim().toLowerCase());
      let brandId: string | null = slugHit ?? nameHit ?? null;

      if (!brandId) {
        const key = m.rawMention.trim().toLowerCase();
        brandId = nameToBrandId.get(key) ?? null;
        if (!brandId) {
          const slug = slugifyBrandName(m.rawMention) || `brand-${Date.now()}`;
          const [inserted] = await db
            .insert(brands)
            .values({
              slug,
              canonicalName: m.rawMention.trim(),
              aliases: [],
              categoryIds: [prompt.categoryId],
              verified: false,
            })
            .onConflictDoNothing({ target: brands.slug })
            .returning({ id: brands.id });
          if (inserted) {
            brandId = inserted.id;
          } else {
            const [existing] = await db
              .select({ id: brands.id })
              .from(brands)
              .where(eq(brands.slug, slug))
              .limit(1);
            brandId = existing?.id ?? null;
          }
          if (brandId) nameToBrandId.set(key, brandId);
        }
      }

      await db.insert(benchmarkBrandMentions).values({
        runId,
        rawMention: m.rawMention,
        brandId,
        rank: m.rank,
        sentiment: m.sentiment,
        context: m.context,
        confidence: m.confidence.toString(),
        extractorVersion: EXTRACTOR_VERSION,
      });
    }

    await db
      .update(benchmarkRuns)
      .set({ extractionStatus: "done" })
      .where(eq(benchmarkRuns.id, runId));
  } catch (err) {
    console.error(`[extract-run] run ${runId} failed:`, err);
    await db
      .update(benchmarkRuns)
      .set({
        extractionStatus: run.extractionAttempts >= 2 ? "failed" : "pending",
        extractionAttempts: run.extractionAttempts + 1,
      })
      .where(eq(benchmarkRuns.id, runId));
  }
}

// Silences "and/unused" lint if import tree shakes weirdly.
void and;
