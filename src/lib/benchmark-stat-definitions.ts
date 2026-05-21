// Single source of truth for end-user-facing stat names + plain-English
// definitions. Consumed by <StatLabel/> popovers and by the
// /benchmark/about page so the two never drift. See ADR-0009 decision 3.

export type BenchmarkStatKey =
  | "visibility"
  | "shareOfVoice"
  | "avgRank"
  | "sentiment"
  | "citationRate"
  | "coverage"
  | "surfaceThreshold"
  | "contributorWeight"
  | "modelSurface";

export type BenchmarkStatDefinition = {
  label: string;
  shortDef: string;
  // Anchor on /benchmark/about (section id). Linked from the popover's
  // "Read more →" link.
  anchor: string;
};

export const BENCHMARK_STAT_DEFINITIONS: Record<
  BenchmarkStatKey,
  BenchmarkStatDefinition
> = {
  visibility: {
    label: "Visibility",
    shortDef:
      "Percent of weighted runs on a given AI product where the brand was mentioned. Higher = the AI brings up this brand more often when asked.",
    anchor: "visibility",
  },
  shareOfVoice: {
    label: "Share of voice",
    shortDef:
      "Of all brand mentions in this category, what fraction belong to this brand. A relative measure across competitors.",
    anchor: "share-of-voice",
  },
  avgRank: {
    label: "Average rank",
    shortDef:
      "When the brand is mentioned, what position does it appear in on average. Lower is better — rank 1 is best.",
    anchor: "average-rank",
  },
  sentiment: {
    label: "Sentiment",
    shortDef:
      "How positive, neutral, or negative the mentions are. Weighted by contributor standing.",
    anchor: "sentiment",
  },
  citationRate: {
    label: "Citation rate",
    shortDef:
      "How often a grounded AI product cites the brand's own site as a source. Only meaningful for surfaces with web search.",
    anchor: "citation-rate",
  },
  coverage: {
    label: "Coverage",
    shortDef:
      "How many distinct contributors have submitted runs for this prompt on this AI product. Used to decide whether headline metrics can be shown publicly.",
    anchor: "coverage",
  },
  surfaceThreshold: {
    label: "Surface threshold",
    shortDef:
      "We only publish per-cell metrics once at least 3 distinct contributors have submitted runs for that prompt on that AI product. Single submissions are visible on the run page but don't drive the headline number.",
    anchor: "surface-threshold",
  },
  contributorWeight: {
    label: "Contributor weight",
    shortDef:
      "Each run carries a weight based on the contributor's standing on AIT — account age, badges, verification, etc. Runs from established members count more in the weighted percentages.",
    anchor: "contributor-weight",
  },
  modelSurface: {
    label: "AI product",
    shortDef:
      "The specific AI product and mode the run was performed in — e.g. ChatGPT with web search on, Claude.ai without web search, Perplexity. This is the primary way we slice the data.",
    anchor: "model-surface",
  },
};

export function statDefinition(key: BenchmarkStatKey): BenchmarkStatDefinition {
  return BENCHMARK_STAT_DEFINITIONS[key];
}
