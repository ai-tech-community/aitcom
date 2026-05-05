// src/server/benchmark/strategy.ts

export type Priority = "low" | "medium" | "high";

export interface Recommendation {
  title: string;
  priority: Priority;
  why: string;
  evidence: string[];
  suggestedAction: string;
  relatedPrompts: string[];
  relatedCompetitors: string[];
  relatedSources: string[];
  expectedMetricImpact: string;
}

export type StrategyInsight =
  | { type: "low_visibility"; severity: Priority; evidence: string[] }
  | {
      type: "competitor_gap";
      severity: Priority;
      competitor: string;
      evidence: string[];
    }
  | {
      type: "source_gap";
      severity: Priority;
      domain: string;
      evidence: string[];
    }
  | {
      type: "prompt_opportunity";
      severity: Priority;
      prompt: string;
      evidence: string[];
    }
  | {
      type: "sentiment_gap";
      severity: Priority;
      modelId: string;
      evidence: string[];
    };

const PRIORITIES: Priority[] = ["low", "medium", "high"];

function stringOrEmpty(value: unknown, maxLen = 400): string {
  return typeof value === "string" ? value.trim().slice(0, maxLen) : "";
}

function stringArray(
  value: unknown,
  maxItems: number,
  maxLen: number,
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim().slice(0, maxLen))
    .slice(0, maxItems);
}

function priorityFrom(value: unknown): Priority | null {
  return typeof value === "string" && PRIORITIES.includes(value as Priority)
    ? (value as Priority)
    : null;
}

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
    const o = r as {
      title?: unknown;
      priority?: unknown;
      severity?: unknown;
      why?: unknown;
      rationale?: unknown;
      evidence?: unknown;
      suggestedAction?: unknown;
      relatedPrompts?: unknown;
      relatedCompetitors?: unknown;
      relatedSources?: unknown;
      expectedMetricImpact?: unknown;
    };
    const title = stringOrEmpty(o.title, 140);
    if (!title) continue;
    const why = stringOrEmpty(o.why) || stringOrEmpty(o.rationale);
    if (!why) continue;
    const priority =
      priorityFrom(o.priority) ?? priorityFrom(o.severity) ?? "medium";
    out.push({
      title,
      priority,
      why,
      evidence: stringArray(o.evidence, 5, 220),
      suggestedAction: stringOrEmpty(o.suggestedAction),
      relatedPrompts: stringArray(o.relatedPrompts, 5, 160),
      relatedCompetitors: stringArray(o.relatedCompetitors, 5, 100),
      relatedSources: stringArray(o.relatedSources, 5, 100),
      expectedMetricImpact: stringOrEmpty(o.expectedMetricImpact),
    });
    if (out.length >= 8) break;
  }
  return out;
}

export interface StrategyInput {
  brandName: string;
  hero: { visibilityPct: number; totalMentions: number; totalRuns: number };
  perModel: Array<{
    modelId: string;
    visibilityPct: number;
    sentimentPosPct: number;
  }>;
  competitors: Array<{
    canonical_name: string;
    visibility_pct: string | number;
  }>;
  citations: Array<{ domain: string; count: number | string }>;
  topPrompts: Array<{ text: string; mentions: number }>;
}

export function buildStrategyInsights(input: StrategyInput): StrategyInsight[] {
  const insights: StrategyInsight[] = [];
  const visibility = Number(input.hero.visibilityPct);

  if (visibility < 20) {
    insights.push({
      type: "low_visibility",
      severity: "high",
      evidence: [
        `${input.brandName} has ${visibility.toFixed(1)}% visibility across ${input.hero.totalRuns} runs.`,
      ],
    });
  }

  for (const competitor of input.competitors.slice(0, 8)) {
    const competitorVisibility = Number(competitor.visibility_pct);
    if (!Number.isFinite(competitorVisibility)) continue;
    const gap = competitorVisibility - visibility;
    if (gap >= 10) {
      insights.push({
        type: "competitor_gap",
        severity: gap >= 20 ? "high" : "medium",
        competitor: competitor.canonical_name,
        evidence: [
          `${competitor.canonical_name} visibility is ${competitorVisibility.toFixed(1)}%, ${gap.toFixed(1)} points above ${input.brandName}.`,
        ],
      });
    }
  }

  for (const citation of input.citations.slice(0, 8)) {
    const count = Number(citation.count);
    if (!citation.domain || !Number.isFinite(count) || count < 2) continue;
    insights.push({
      type: "source_gap",
      severity: count >= 5 ? "high" : "medium",
      domain: citation.domain,
      evidence: [`${citation.domain} appears in ${count} category citations.`],
    });
  }

  if (visibility < 20) {
    for (const prompt of input.topPrompts.slice(0, 8)) {
      const mentions = Number(prompt.mentions);
      if (!prompt.text || !Number.isFinite(mentions) || mentions <= 0) continue;
      insights.push({
        type: "prompt_opportunity",
        severity: mentions >= 3 ? "high" : "medium",
        prompt: prompt.text,
        evidence: [
          `Prompt "${prompt.text}" has ${mentions} ${
            mentions === 1 ? "mention" : "mentions"
          } while overall visibility is ${visibility.toFixed(1)}%.`,
        ],
      });
    }
  }

  for (const model of input.perModel.slice(0, 10)) {
    if (model.sentimentPosPct < 40) {
      insights.push({
        type: "sentiment_gap",
        severity: model.sentimentPosPct < 25 ? "high" : "medium",
        modelId: model.modelId,
        evidence: [
          `${model.modelId} positive sentiment is ${model.sentimentPosPct.toFixed(0)}%.`,
        ],
      });
    }
  }

  return insights.slice(0, 20);
}

function knownSet(values: string[]): Map<string, string> {
  return new Map(
    values
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => [value.toLowerCase(), value]),
  );
}

function filterKnown(values: string[], known: Map<string, string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const match = known.get(value.trim().toLowerCase());
    if (!match || seen.has(match)) continue;
    seen.add(match);
    out.push(match);
  }
  return out;
}

function recommendationTitle(recommendation: {
  relatedCompetitors: string[];
  relatedPrompts: string[];
  relatedSources: string[];
  evidence: string[];
}): string {
  if (recommendation.relatedCompetitors.length > 0) {
    return "Act on grounded competitor evidence";
  }
  if (recommendation.relatedPrompts.length > 0) {
    return "Act on grounded prompt evidence";
  }
  if (recommendation.relatedSources.length > 0) {
    return "Act on grounded source evidence";
  }
  return "Act on grounded benchmark evidence";
}

function recommendationAction(recommendation: {
  relatedCompetitors: string[];
  relatedPrompts: string[];
  relatedSources: string[];
}): string {
  if (recommendation.relatedCompetitors.length > 0) {
    return `Close the visibility gap with ${recommendation.relatedCompetitors.join(", ")}.`;
  }
  if (recommendation.relatedPrompts.length > 0) {
    return `Improve content coverage for "${recommendation.relatedPrompts[0]}".`;
  }
  if (recommendation.relatedSources.length > 0) {
    return `Improve presence on ${recommendation.relatedSources.join(", ")}.`;
  }
  return "Act on the grounded benchmark evidence.";
}

function metricImpact(recommendation: {
  relatedCompetitors: string[];
  relatedPrompts: string[];
  relatedSources: string[];
}): string {
  if (recommendation.relatedCompetitors.length > 0) {
    return "Improve visibility against the related competitor.";
  }
  if (recommendation.relatedPrompts.length > 0) {
    return "Improve visibility for the related prompt.";
  }
  if (recommendation.relatedSources.length > 0) {
    return "Improve visibility for the related source.";
  }
  return "Improve benchmark visibility.";
}

export function normalizeStrategyRecommendations(
  recommendations: Recommendation[],
  input: StrategyInput,
): Recommendation[] {
  const promptSet = knownSet(input.topPrompts.map((prompt) => prompt.text));
  const competitorSet = knownSet(
    input.competitors.map((competitor) => competitor.canonical_name),
  );
  const sourceSet = knownSet(
    input.citations.map((citation) => citation.domain),
  );
  const evidenceSet = knownSet(
    buildStrategyInsights(input).flatMap((insight) => insight.evidence),
  );

  const normalized = recommendations.flatMap((recommendation) => {
    const relatedPrompts = filterKnown(
      recommendation.relatedPrompts,
      promptSet,
    );
    const relatedCompetitors = filterKnown(
      recommendation.relatedCompetitors,
      competitorSet,
    );
    const relatedSources = filterKnown(
      recommendation.relatedSources,
      sourceSet,
    );
    const evidence = filterKnown(recommendation.evidence, evidenceSet);
    const grounded = {
      evidence,
      relatedPrompts,
      relatedCompetitors,
      relatedSources,
    };
    const hasGrounding =
      evidence.length > 0 ||
      relatedPrompts.length > 0 ||
      relatedCompetitors.length > 0 ||
      relatedSources.length > 0;
    if (!hasGrounding) return [];

    return [
      {
        title: recommendationTitle(grounded),
        priority: recommendation.priority,
        why: `Grounded evidence: ${evidence[0] ?? "related benchmark evidence is available."}`,
        evidence,
        suggestedAction: recommendationAction(grounded),
        relatedPrompts,
        relatedCompetitors,
        relatedSources,
        expectedMetricImpact: metricImpact(grounded),
      },
    ];
  });

  return normalized.slice(0, 8);
}

export async function generateStrategy(
  input: StrategyInput,
): Promise<Recommendation[]> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY missing");
  const model = process.env.EXTRACTOR_MODEL ?? "moonshotai/kimi-k2.5";
  const insights = buildStrategyInsights(input);

  const prompt = `You are a marketing strategist analyzing AI-search visibility for the brand "${input.brandName}".

CURRENT STATS:
- Overall visibility: ${input.hero.visibilityPct.toFixed(1)}% (${input.hero.totalMentions} mentions across ${input.hero.totalRuns} runs)

PER MODEL (mentions / visibility %):
${
  input.perModel
    .map(
      (m) =>
        `- ${m.modelId}: ${m.visibilityPct.toFixed(1)}% visibility, ${m.sentimentPosPct.toFixed(0)}% positive sentiment`,
    )
    .join("\n") || "(no per-model data)"
}

TOP COMPETITORS:
${
  input.competitors
    .map(
      (c) =>
        `- ${c.canonical_name}: ${Number(c.visibility_pct).toFixed(1)}% visibility`,
    )
    .join("\n") || "(none)"
}

TOP CITATION SOURCES (domains LLMs cite when discussing this category):
${
  input.citations
    .map((c) => `- ${c.domain}: ${Number(c.count)} citations`)
    .join("\n") || "(no citations)"
}

TOP PROMPTS (questions where this brand gets mentioned):
${
  input.topPrompts
    .slice(0, 5)
    .map((p) => `- "${p.text}" — ${p.mentions} mentions`)
    .join("\n") || "(none)"
}

EVIDENCE_INSIGHTS:
${JSON.stringify(insights, null, 2)}

TASK: Produce 3-5 specific, actionable recommendations to improve this brand's visibility in AI search answers. Focus on concrete actions (content to publish, platforms to target, gaps vs competitors). Avoid generic advice. Use only the evidence above. Do not invent domains, prompts, or competitors.

OUTPUT SCHEMA (return ONLY JSON):
{
  "recommendations": [
    {
      "title": "string, imperative short headline (<= 140 chars)",
      "priority": "low" | "medium" | "high",
      "why": "string, one-sentence WHY tied to EVIDENCE_INSIGHTS or stats above (<= 400 chars)",
      "evidence": ["string, direct evidence from EVIDENCE_INSIGHTS or stats above"],
      "suggestedAction": "string, concrete action to take next (<= 400 chars)",
      "relatedPrompts": ["string, only prompts shown above"],
      "relatedCompetitors": ["string, only competitors shown above"],
      "relatedSources": ["string, only citation domains shown above"],
      "expectedMetricImpact": "string, metric likely to improve (<= 400 chars)"
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
  return normalizeStrategyRecommendations(parseStrategyResponse(text), input);
}
