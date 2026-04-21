/**
 * Dev-only: extract brand mentions for a pending benchmark run WITHOUT the
 * webhook/agent dance. Hits the DB directly and calls OpenRouter.
 *
 * Usage:
 *   pnpm dlx tsx --env-file=.env src/scripts/dev-extract-run.ts <runId>
 *
 * Env required: OPENROUTER_API_KEY, DATABASE_URL
 * Optional: EXTRACTOR_MODEL (defaults to moonshotai/kimi-k2.5)
 */

import { neon } from "@neondatabase/serverless";
import { slugifyBrandName } from "@/server/benchmark/slugify";

const runId = process.argv[2];
if (!runId) {
  console.error("Usage: tsx src/scripts/dev-extract-run.ts <runId>");
  process.exit(1);
}

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) {
  console.error("OPENROUTER_API_KEY missing (put in .env)");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing (put in .env)");
  process.exit(1);
}

const MODEL = process.env.EXTRACTOR_MODEL ?? "moonshotai/kimi-k2.5";
const sql = neon(process.env.DATABASE_URL);

type PromptRow = { text: string; category_id: string };
type RunRow = { id: string; prompt_id: string; raw_answer: string };
type BrandRow = {
  id: string;
  slug: string;
  canonical_name: string;
  aliases: string[] | null;
};

async function callExtractor(prompt: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "https://aitcommunity.org",
      "X-Title": "AIT Benchmark Extractor",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Empty response: ${JSON.stringify(data)}`);
  return text;
}

async function main() {
  const [run] = (await sql`
    SELECT id, prompt_id, raw_answer
    FROM "app"."benchmark_run"
    WHERE id = ${runId}
  `) as RunRow[];
  if (!run) throw new Error(`Run ${runId} not found`);

  const [prompt] = (await sql`
    SELECT text, category_id FROM "app"."benchmark_prompt"
    WHERE id = ${run.prompt_id}
  `) as PromptRow[];
  if (!prompt) throw new Error("Prompt not found");

  const knownBrands = (await sql`
    SELECT id, slug, canonical_name, aliases
    FROM "app"."brand"
    WHERE ${prompt.category_id} = ANY(category_ids)
  `) as BrandRow[];

  await sql`
    UPDATE "app"."benchmark_run"
    SET extraction_status = 'processing'
    WHERE id = ${runId}
  `;

  const brandList = knownBrands
    .map(
      (b) =>
        `- ${b.canonical_name} [slug: ${b.slug}] aliases: ${(b.aliases ?? []).join(", ") || "(none)"}`,
    )
    .join("\n");

  const rendered = `You are a brand-extraction assistant. Given an AI model's answer to a user prompt, identify every brand, product, or company name the answer mentions. Return ONLY JSON matching the schema below.

INPUT PROMPT:
${prompt.text}

MODEL ANSWER:
${run.raw_answer}

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

  console.log(`Calling OpenRouter (model: ${MODEL})…`);
  const text = await callExtractor(rendered);

  let parsed: {
    mentions: Array<{
      rawMention: string;
      suggestedBrandSlug: string | null;
      rank: number | null;
      sentiment: "positive" | "neutral" | "negative";
      context: string;
      confidence: number;
    }>;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Extractor returned non-JSON: ${text.slice(0, 300)}`);
  }
  console.log(`Extractor produced ${parsed.mentions.length} mentions`);

  const bySlug = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const b of knownBrands) {
    bySlug.set(b.slug.toLowerCase(), b.id);
    byName.set(b.canonical_name.toLowerCase(), b.id);
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
        const inserted = (await sql`
          INSERT INTO "app"."brand"
            ("slug", "canonical_name", "aliases", "category_ids", "verified")
          VALUES (${slug}, ${m.rawMention.trim()}, ARRAY[]::text[],
                  ARRAY[${prompt.category_id}]::uuid[], false)
          ON CONFLICT (slug) DO NOTHING
          RETURNING id
        `) as Array<{ id: string }>;
        if (inserted[0]) {
          brandId = inserted[0].id;
        } else {
          const [existing] = (await sql`
            SELECT id FROM "app"."brand" WHERE slug = ${slug} LIMIT 1
          `) as Array<{ id: string }>;
          brandId = existing?.id ?? null;
        }
        if (brandId) nameToBrandId.set(key, brandId);
      }
    }

    await sql`
      INSERT INTO "app"."benchmark_brand_mention"
      ("run_id", "raw_mention", "brand_id", "rank", "sentiment", "context", "confidence", "extractor_version")
      VALUES (${runId}, ${m.rawMention}, ${brandId}, ${m.rank},
              ${m.sentiment}, ${m.context}, ${m.confidence.toString()}, 'v1-openrouter')
    `;
  }

  await sql`
    UPDATE "app"."benchmark_run"
    SET extraction_status = 'done'
    WHERE id = ${runId}
  `;

  console.log("Done. Run marked extraction_status='done'.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
