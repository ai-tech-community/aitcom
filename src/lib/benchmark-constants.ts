// src/lib/benchmark-constants.ts
export const BENCHMARK_PROMPT_STATUS = [
  "pending",
  "approved",
  "rejected",
] as const;
export type BenchmarkPromptStatus = (typeof BENCHMARK_PROMPT_STATUS)[number];

export const BENCHMARK_EXTRACTION_STATUS = [
  "pending",
  "processing",
  "done",
  "failed",
] as const;
export type BenchmarkExtractionStatus =
  (typeof BENCHMARK_EXTRACTION_STATUS)[number];

export const BENCHMARK_MODEL_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "meta",
  "mistral",
  "xai",
  "moonshot",
  "perplexity",
  "other",
] as const;
export type BenchmarkModelProvider = (typeof BENCHMARK_MODEL_PROVIDERS)[number];

// User-selectable model surfaces. Mirrors the `app.model_surface` Postgres
// enum (see migration 20260518_benchmark_surface_and_proxy) minus
// `legacy_unverified`, which is a backfill-only marker and never user-
// selectable. See [[adr-0001-brand-benchmark-primary-slice-keys]] and
// [[adr-0007-byoa-trust-model]].
export const BENCHMARK_MODEL_SURFACES = [
  "chatgpt_grounded",
  "chatgpt_ungrounded",
  "claude_grounded",
  "claude_ungrounded",
  "gemini_grounded",
  "gemini_ungrounded",
  "perplexity",
  "kimi_grounded",
] as const;
export type BenchmarkModelSurface = (typeof BENCHMARK_MODEL_SURFACES)[number];

// Human-readable labels for the surface picker. Order matches expected
// submission volume (ChatGPT/Claude/Gemini first, always-grounded last).
export const BENCHMARK_MODEL_SURFACE_LABELS: Record<
  BenchmarkModelSurface,
  string
> = {
  chatgpt_grounded: "ChatGPT — with web search",
  chatgpt_ungrounded: "ChatGPT — without web search",
  claude_grounded: "Claude.ai — with web search",
  claude_ungrounded: "Claude.ai — without web search",
  gemini_grounded: "Gemini — with web search",
  gemini_ungrounded: "Gemini — without web search",
  perplexity: "Perplexity (always grounded)",
  kimi_grounded: "Kimi (always grounded)",
};

const SURFACE_PROVIDER: Record<BenchmarkModelSurface, BenchmarkModelProvider> =
  {
    chatgpt_grounded: "openai",
    chatgpt_ungrounded: "openai",
    claude_grounded: "anthropic",
    claude_ungrounded: "anthropic",
    gemini_grounded: "google",
    gemini_ungrounded: "google",
    perplexity: "perplexity",
    kimi_grounded: "moonshot",
  };

export function providerForSurface(
  surface: BenchmarkModelSurface,
): BenchmarkModelProvider {
  return SURFACE_PROVIDER[surface];
}

// Per ADR-0007 decision 2: a (prompt, model_surface) cell's aggregated
// metrics are not displayed publicly until this many distinct
// contributors have submitted to it.
export const BENCHMARK_SURFACE_THRESHOLD_CONTRIBUTORS = 3;

export const BENCHMARK_SENTIMENTS = [
  "positive",
  "neutral",
  "negative",
] as const;
export type BenchmarkSentiment = (typeof BENCHMARK_SENTIMENTS)[number];

export const BENCHMARK_DEFAULT_LOCALE = "en-US";

export const BENCHMARK_ALIAS_QUEUE_STATUS = [
  "pending",
  "merged",
  "rejected",
] as const;
export type BenchmarkAliasQueueStatus =
  (typeof BENCHMARK_ALIAS_QUEUE_STATUS)[number];

export const SEED_INTENTS = [
  {
    slug: "recommendation",
    name: "Recommendation",
    description: "Asks the model to recommend one or more brands.",
  },
  {
    slug: "comparison",
    name: "Comparison",
    description: "Asks the model to compare two or more named brands.",
  },
  {
    slug: "best-for-persona",
    name: "Best for persona",
    description:
      "Asks the model to recommend the best brand for a specific user type.",
  },
  {
    slug: "brand-recall",
    name: "Brand recall",
    description: "Asks the model to list brands the user should know about.",
  },
  {
    slug: "ranked-list",
    name: "Ranked list",
    description: "Asks the model to produce a ranked list of brands.",
  },
  {
    slug: "pros-cons",
    name: "Pros & cons",
    description: "Asks the model to list pros and cons of named brands.",
  },
] as const;
