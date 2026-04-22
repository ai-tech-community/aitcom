// src/server/benchmark/suggest-prompts.ts
export interface SuggestionInput {
  brand: {
    canonicalName: string;
    aliases: string[];
  };
  categories: Array<{ slug: string; name: string }>;
  intents: Array<{ slug: string; name: string; description?: string | null }>;
  limit: number; // how many suggestions to request
}

export interface Suggestion {
  text: string;
  categorySlug: string;
  intentSlug: string;
  tags: string[];
}

export function parseSuggestionResponse(
  raw: string,
  knownCategorySlugs: Set<string>,
  knownIntentSlugs: Set<string>,
): Suggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const root = parsed as { suggestions?: unknown };
  if (!Array.isArray(root.suggestions)) return [];
  const out: Suggestion[] = [];
  for (const s of root.suggestions) {
    if (!s || typeof s !== "object") continue;
    const o = s as {
      text?: unknown;
      categorySlug?: unknown;
      intentSlug?: unknown;
      tags?: unknown;
    };
    if (typeof o.text !== "string" || o.text.trim().length < 4) continue;
    if (typeof o.categorySlug !== "string") continue;
    if (typeof o.intentSlug !== "string") continue;
    if (!knownCategorySlugs.has(o.categorySlug)) continue;
    if (!knownIntentSlugs.has(o.intentSlug)) continue;
    const rawTags = Array.isArray(o.tags) ? o.tags : [];
    const tags = rawTags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length <= 40)
      .slice(0, 10);
    out.push({
      text: o.text.trim().slice(0, 500),
      categorySlug: o.categorySlug,
      intentSlug: o.intentSlug,
      tags,
    });
  }
  return out;
}

export async function suggestPromptsForBrand(
  input: SuggestionInput,
): Promise<Suggestion[]> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY missing");
  const model = process.env.EXTRACTOR_MODEL ?? "moonshotai/kimi-k2.5";

  const categoryList = input.categories
    .map((c) => `- ${c.slug}: ${c.name}`)
    .join("\n");
  const intentList = input.intents
    .map(
      (i) =>
        `- ${i.slug}: ${i.name}${i.description ? " — " + i.description : ""}`,
    )
    .join("\n");

  const prompt = `You generate representative benchmark prompts that AI models might be asked, which naturally surface the brand "${input.brand.canonicalName}"${input.brand.aliases.length ? ` (also known as: ${input.brand.aliases.join(", ")})` : ""}. These prompts will be run against LLMs to measure brand visibility.

CATEGORY CATALOG (slug: display name):
${categoryList}

INTENT CATALOG (slug: display name):
${intentList}

TASK: Produce ${input.limit} diverse prompts. Each prompt should be a realistic, natural-language question a user might ask ChatGPT / Claude / Gemini / Perplexity. Cover different intents and angles. DO NOT mention the brand by name in the prompt text — prompts should be neutral so the LLM's answer naturally reveals which brands come up.

OUTPUT SCHEMA (return ONLY JSON):
{
  "suggestions": [
    {
      "text": "string (the user question, 4-500 chars, does NOT name the brand)",
      "categorySlug": "string (from catalog above, exact match)",
      "intentSlug": "string (from catalog above, exact match)",
      "tags": ["0-5 short lowercase tags"]
    }
  ]
}

Return ONLY the JSON object. No prose, no markdown fences.`;

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openrouterKey}`,
      "HTTP-Referer": "https://aitcommunity.org",
      "X-Title": "AIT Benchmark Prompt Suggester",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });
  if (!resp.ok) {
    throw new Error(`OpenRouter ${resp.status}: ${await resp.text()}`);
  }
  const body = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty OpenRouter response");

  const knownCategorySlugs = new Set(input.categories.map((c) => c.slug));
  const knownIntentSlugs = new Set(input.intents.map((i) => i.slug));
  return parseSuggestionResponse(text, knownCategorySlugs, knownIntentSlugs);
}
