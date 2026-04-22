// src/server/benchmark/extract-run.ts
//
// Shared extraction pipeline used by both the inline hook from submitRun
// (fire-and-forget via Next.js `after()`) and the dev-extract-run CLI.
// Writes brand mentions, auto-creates unknown brands, flips extraction_status.

import { and, eq, sql } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import {
  benchmarkBrandMentions,
  benchmarkCategories,
  benchmarkCitations,
  benchmarkPrompts,
  benchmarkRuns,
  brands,
} from "@/server/db/schema";
import { slugifyBrandName } from "@/server/benchmark/slugify";
import { normalizeCitations } from "./extract-citations-ingest";

type DB = typeof _db;

type ExtractorMention = {
  rawMention: string;
  suggestedBrandSlug: string | null;
  rank: number | null;
  sentiment: "positive" | "neutral" | "negative";
  context: string;
  confidence: number;
};

type ExtractorOutput = {
  mentions: ExtractorMention[];
  inferredCategorySlugs?: string[];
  citations?: Array<{
    url: string;
    domain: string;
    title?: string | null;
    snippet?: string | null;
    position: number;
  }>;
};

const EXTRACTOR_VERSION = "v2-openrouter-citations";

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
      inferredCategoryIds: benchmarkPrompts.inferredCategoryIds,
    })
    .from(benchmarkPrompts)
    .where(eq(benchmarkPrompts.id, run.promptId))
    .limit(1);
  if (!prompt) {
    console.error(`[extract-run] prompt for run ${runId} not found`);
    return;
  }

  const allCategories = await db
    .select({
      id: benchmarkCategories.id,
      slug: benchmarkCategories.slug,
      name: benchmarkCategories.name,
    })
    .from(benchmarkCategories);

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

    const categoryCatalog = allCategories
      .map((c) => `- ${c.slug}: ${c.name}`)
      .join("\n");

    const primarySlug =
      allCategories.find((c) => c.id === prompt.categoryId)?.slug ?? "unknown";

    const rendered = `You are a brand-extraction assistant. Given an AI model's answer to a user prompt, identify every brand, product, or company name the answer mentions, and classify which high-level categories the prompt and answer together actually cover. Return ONLY JSON matching the schema below.

INPUT PROMPT:
${prompt.text}

MODEL ANSWER:
${run.rawAnswer}

KNOWN BRANDS IN THIS CATEGORY:
${brandList || "(none — this is a new category)"}

CATEGORY CATALOG (slug: display name):
${categoryCatalog}

PRIMARY CATEGORY (author-assigned, already tagged): ${primarySlug}

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
  ],
  "inferredCategorySlugs": ["zero to 3 slugs from the catalog above, excluding the primary"],
  "citations": [
    {
      "url": "full URL exactly as it appears in the answer",
      "domain": "registrable domain only (eTLD+1), e.g. 'reddit.com' not 'www.reddit.com'",
      "title": "link text if the URL came from a markdown link, else null",
      "snippet": "up to 280 chars of surrounding answer text, or null",
      "position": "1-based ordinal position of first appearance in the answer"
    }
  ]
}

RULES:
- Merge duplicate mentions of the same brand into one entry; use the first occurrence's rank.
- Only set suggestedBrandSlug if the rawMention clearly matches a known brand's canonical name or alias (case-insensitive).
- If the answer has no brand mentions, return {"mentions": []}.
- Do not invent brands. Do not include generic terms ("the database", "an editor").
- inferredCategorySlugs: pick only categories the answer truly covers (e.g. the prompt is about email-newsletter tools → inferred may include "saas" and "media" if the answer discusses both). Do NOT include the primary slug. Use only slugs from the catalog. If nothing else clearly applies, return [].
- citations: extract every URL present in the answer (inline links, footnotes, "Sources:" sections, bracketed references). Strip www. when computing domain. If no URLs present, return "citations": []. Dedupe by url.
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

    const parsed = JSON.parse(text) as ExtractorOutput;

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

    // Merge LLM-inferred co-categories into the prompt. Drop duplicates,
    // drop the primary, and only accept slugs that exist in the catalog.
    const inferredSlugs = (parsed.inferredCategorySlugs ?? [])
      .map((s) => (typeof s === "string" ? s.trim().toLowerCase() : ""))
      .filter((s): s is string => s.length > 0);
    if (inferredSlugs.length > 0) {
      const slugToId = new Map(
        allCategories.map((c) => [c.slug.toLowerCase(), c.id]),
      );
      const newInferredIds = Array.from(
        new Set(
          inferredSlugs
            .map((s) => slugToId.get(s))
            .filter((id): id is string => Boolean(id))
            .filter((id) => id !== prompt.categoryId),
        ),
      );
      if (newInferredIds.length > 0) {
        const existing = new Set(prompt.inferredCategoryIds ?? []);
        const merged = Array.from(new Set([...existing, ...newInferredIds]));
        if (merged.length !== existing.size) {
          await db
            .update(benchmarkPrompts)
            .set({ inferredCategoryIds: merged })
            .where(eq(benchmarkPrompts.id, run.promptId));
        }
      }
    }

    const citations = normalizeCitations(parsed.citations);
    if (citations.length > 0) {
      try {
        await db
          .insert(benchmarkCitations)
          .values(
            citations.map((c) => ({
              runId,
              url: c.url,
              domain: c.domain,
              title: c.title,
              snippet: c.snippet,
              position: c.position,
            })),
          )
          .onConflictDoNothing({
            target: [benchmarkCitations.runId, benchmarkCitations.url],
          });
      } catch (err) {
        console.warn(
          `[extractRunInline] citation insert failed for run ${runId}:`,
          err,
        );
      }
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
