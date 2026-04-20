// src/lib/benchmark-constants.ts
export const BENCHMARK_PROMPT_STATUS = ["pending", "approved", "rejected"] as const;
export type BenchmarkPromptStatus = (typeof BENCHMARK_PROMPT_STATUS)[number];

export const BENCHMARK_EXTRACTION_STATUS = [
  "pending",
  "processing",
  "done",
  "failed",
] as const;
export type BenchmarkExtractionStatus = (typeof BENCHMARK_EXTRACTION_STATUS)[number];

export const BENCHMARK_MODEL_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "meta",
  "mistral",
  "xai",
  "other",
] as const;
export type BenchmarkModelProvider = (typeof BENCHMARK_MODEL_PROVIDERS)[number];

export const BENCHMARK_SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type BenchmarkSentiment = (typeof BENCHMARK_SENTIMENTS)[number];

export const BENCHMARK_DEFAULT_LOCALE = "en-US";

export const BENCHMARK_ALIAS_QUEUE_STATUS = ["pending", "merged", "rejected"] as const;
export type BenchmarkAliasQueueStatus = (typeof BENCHMARK_ALIAS_QUEUE_STATUS)[number];

export const SEED_INTENTS = [
  { slug: "recommendation", name: "Recommendation",
    description: "Asks the model to recommend one or more brands." },
  { slug: "comparison", name: "Comparison",
    description: "Asks the model to compare two or more named brands." },
  { slug: "best-for-persona", name: "Best for persona",
    description: "Asks the model to recommend the best brand for a specific user type." },
  { slug: "brand-recall", name: "Brand recall",
    description: "Asks the model to list brands the user should know about." },
  { slug: "ranked-list", name: "Ranked list",
    description: "Asks the model to produce a ranked list of brands." },
  { slug: "pros-cons", name: "Pros & cons",
    description: "Asks the model to list pros and cons of named brands." },
] as const;
