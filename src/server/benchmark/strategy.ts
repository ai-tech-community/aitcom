// src/server/benchmark/strategy.ts

export type Severity = "low" | "medium" | "high";

export interface Recommendation {
  title: string;
  rationale: string;
  severity: Severity;
}

const SEVERITIES: Severity[] = ["low", "medium", "high"];

export function parseStrategyResponse(raw: string): Recommendation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const root = parsed as { recommendations?: unknown };
  if (!Array.isArray(root.recommendations)) return [];
  const out: Recommendation[] = [];
  for (const r of root.recommendations) {
    if (!r || typeof r !== "object") continue;
    const o = r as { title?: unknown; rationale?: unknown; severity?: unknown };
    if (typeof o.title !== "string" || o.title.trim().length === 0) continue;
    if (typeof o.rationale !== "string" || o.rationale.trim().length === 0) continue;
    const sev =
      typeof o.severity === "string" && SEVERITIES.includes(o.severity as Severity)
        ? (o.severity as Severity)
        : "medium";
    out.push({
      title: o.title.trim().slice(0, 140),
      rationale: o.rationale.trim().slice(0, 400),
      severity: sev,
    });
    if (out.length >= 8) break;
  }
  return out;
}

export interface StrategyInput {
  brandName: string;
  hero: { visibilityPct: number; totalMentions: number; totalRuns: number };
  perModel: Array<{ modelId: string; visibilityPct: number; sentimentPosPct: number }>;
  competitors: Array<{ canonical_name: string; visibility_pct: string | number }>;
  citations: Array<{ domain: string; count: number | string }>;
  topPrompts: Array<{ text: string; mentions: number }>;
}

export async function generateStrategy(
  input: StrategyInput,
): Promise<Recommendation[]> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY missing");
  const model = process.env.EXTRACTOR_MODEL ?? "moonshotai/kimi-k2.5";

  const prompt = `You are a marketing strategist analyzing AI-search visibility for the brand "${input.brandName}".

CURRENT STATS:
- Overall visibility: ${input.hero.visibilityPct.toFixed(1)}% (${input.hero.totalMentions} mentions across ${input.hero.totalRuns} runs)

PER MODEL (mentions / visibility %):
${input.perModel
  .map(
    (m) =>
      `- ${m.modelId}: ${m.visibilityPct.toFixed(1)}% visibility, ${m.sentimentPosPct.toFixed(0)}% positive sentiment`,
  )
  .join("\n") || "(no per-model data)"}

TOP COMPETITORS:
${input.competitors
  .map((c) => `- ${c.canonical_name}: ${Number(c.visibility_pct).toFixed(1)}% visibility`)
  .join("\n") || "(none)"}

TOP CITATION SOURCES (domains LLMs cite when discussing this category):
${input.citations
  .map((c) => `- ${c.domain}: ${Number(c.count)} citations`)
  .join("\n") || "(no citations)"}

TOP PROMPTS (questions where this brand gets mentioned):
${input.topPrompts
  .slice(0, 5)
  .map((p) => `- "${p.text}" — ${p.mentions} mentions`)
  .join("\n") || "(none)"}

TASK: Produce 3-5 specific, actionable recommendations to improve this brand's visibility in AI search answers. Focus on concrete actions (content to publish, platforms to target, gaps vs competitors). Avoid generic advice.

OUTPUT SCHEMA (return ONLY JSON):
{
  "recommendations": [
    {
      "title": "string, imperative short headline (<= 140 chars)",
      "rationale": "string, one-sentence WHY tied to the data above (<= 400 chars)",
      "severity": "low" | "medium" | "high"
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
      "X-Title": "AIT Benchmark Strategy Advisor",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.4,
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
  return parseStrategyResponse(text);
}
