import {
  normalizeStartupHomepage,
  resolveStartupPinCoords,
  sanitizeStartupSources,
  type StartupCategoryId,
  type StartupPublicCard,
} from "./startups";

/**
 * Ops-Passed Startups v1 (20/20). Pulse verified 2026-09-15.
 * Live rows are inserted into Neon by the seed migration — not rendered
 * from this list in UI components.
 */
export const STARTUPS_V1_LISTED_ON = "2026-09-15";

/** Pulse overflow — not in v1. Kept so inserts cannot silently pick them up. */
export const STARTUPS_V1_OVERFLOW_HOMEPAGES = [
  "https://www.together.ai",
  "https://replicate.com",
  "https://www.midjourney.com",
  "https://elevenlabs.io",
  "https://runway.com",
  "https://scale.com",
  "https://www.glean.com",
  "https://sierra.ai",
  "https://factory.ai",
  "https://cognition.com",
] as const;

export type StartupV1Seed = {
  id: string;
  name: string;
  homepage: string;
  category: StartupCategoryId;
  sources: string[];
  region: string | null;
  stage: string | null;
  logoUrl: string | null;
  listedOn: string;
};

function homepage(href: string): string {
  const normalized = normalizeStartupHomepage(href);
  if (!normalized) {
    throw new Error(`Startups v1 seed has an invalid homepage: ${href}`);
  }
  return normalized;
}

function sourcesOf(hrefs: readonly string[]): string[] {
  const sources = sanitizeStartupSources(hrefs);
  if (sources.length < 1) {
    throw new Error("Startups v1 seed is missing verified sources.");
  }
  return sources;
}

function seed(row: Omit<StartupV1Seed, "listedOn" | "homepage" | "sources"> & {
  homepage: string;
  sources: readonly string[];
}): StartupV1Seed {
  return {
    ...row,
    homepage: homepage(row.homepage),
    sources: sourcesOf(row.sources),
    listedOn: STARTUPS_V1_LISTED_ON,
  };
}

export const STARTUPS_V1_SEEDS: readonly StartupV1Seed[] = [
  seed({
    id: "startup-figure-ai",
    name: "Figure AI",
    homepage: "https://www.figure.ai/",
    category: "robotics",
    sources: [
      "https://en.wikipedia.org/wiki/Figure_AI",
      "https://techcrunch.com/tag/figure-ai/",
    ],
    region: null,
    stage: null,
    logoUrl:
      "https://images.ctfassets.net/qx5k8y1u9drj/56I3mHKEdLZdrsONwOm3sc/63b1569bb855cc334c2dda67ce40ba4a/generic-page-image.jpeg",
  }),
  seed({
    id: "startup-agility-robotics",
    name: "Agility Robotics",
    homepage: "https://www.agilityrobotics.com/",
    category: "robotics",
    sources: [
      "https://en.wikipedia.org/wiki/Agility_Robotics",
      "https://www.agilityrobotics.com/company-overview",
    ],
    region: null,
    stage: null,
    logoUrl:
      "https://cdn.prod.website-files.com/68d6ca150ffa11fdc25d7575/698c88da0a3bf08e257409ea_80ed2951470859371c4f50dec21751bd_digit-profile.jpg",
  }),
  seed({
    id: "startup-apptronik",
    name: "Apptronik",
    homepage: "https://apptronik.com/",
    category: "robotics",
    sources: [
      "https://techcrunch.com/tag/apptronik/",
      "https://apptronik.com/company/press-releases",
      "https://apptronik.com/company/in-the-news",
    ],
    region: null,
    stage: null,
    logoUrl:
      "https://cdn.prod.website-files.com/6a0dd86942776facbc2f6ba4/6a0dd86942776facbc2f6e8f_apptronik-webclip.png",
  }),
  seed({
    id: "startup-1x-technologies",
    name: "1X Technologies",
    homepage: "https://www.1x.tech/",
    category: "robotics",
    sources: [
      "https://en.wikipedia.org/wiki/1X_Technologies",
      "https://www.1x.tech/about",
      "https://techcrunch.com/tag/1x/",
    ],
    region: null,
    stage: null,
    logoUrl:
      "https://cdn.sanity.io/images/qka6yvsc/production/fdda789a2e7c6caa9a798dd920b8a0acb254ea9d-1200x630.jpg?fit=max&auto=format",
  }),
  seed({
    id: "startup-physical-intelligence",
    name: "Physical Intelligence",
    homepage: "https://www.pi.website/",
    category: "robotics",
    sources: [
      "https://www.pi.website/blog/pi0",
      "https://techcrunch.com/2026/01/30/physical-intelligence-stripe-veteran-lachy-grooms-latest-bet-is-building-silicon-valleys-buzziest-robot-brains/",
      "https://techcrunch.com/2026/03/27/physical-intelligence-is-reportedly-in-talks-to-raise-1-billion-again/",
    ],
    region: null,
    stage: null,
    logoUrl: "https://physicalintelligence.company/images/og/og.png",
  }),
  seed({
    id: "startup-skild-ai",
    name: "Skild AI",
    homepage: "https://www.skild.ai/",
    category: "robotics",
    sources: [
      "https://techcrunch.com/2025/01/28/softbank-to-invest-500m-in-robotics-startup-skildai/",
      "https://techcrunch.com/2025/12/08/softbank-and-nvidia-reportedly-in-talks-to-fund-skildai-at-14b-nearly-tripling-its-value/",
      "https://techcrunch.com/tag/skild/",
    ],
    region: null,
    stage: null,
    logoUrl: "https://www.skild.ai/opengraph-image.png?8499c556da4d12e7",
  }),
  seed({
    id: "startup-crusoe",
    name: "Crusoe",
    homepage: "https://www.crusoe.ai/",
    category: "energy",
    sources: [
      "https://www.crusoe.ai/resources/newsroom",
      "https://techcrunch.com/tag/crusoe/",
      "https://www.crusoe.ai/resources/newsroom/crusoe-and-aalo-atomics-form-strategic-partnership-with-goal-of-deploying-first-nuclear-powered-ai-factory",
    ],
    region: null,
    stage: null,
    logoUrl:
      "https://cdn.prod.website-files.com/6855c1aa175582ee23e0aa19/68e56afb7fd29e836c07c81b_og-crusoe-home.png",
  }),
  seed({
    id: "startup-aalo-atomics",
    name: "Aalo Atomics",
    homepage: "https://www.aalo.com/",
    category: "energy",
    sources: [
      "https://www.aalo.com/post/crusoe-and-aalo-atomics-form-strategic-partnership",
      "https://www.crusoe.ai/resources/newsroom/crusoe-and-aalo-atomics-form-strategic-partnership-with-goal-of-deploying-first-nuclear-powered-ai-factory",
    ],
    region: null,
    stage: null,
    logoUrl:
      "https://cdn.prod.website-files.com/6a4b99ecaf48385ceb81b786/6a4b99ecaf48385ceb81b903_og-a.png",
  }),
  seed({
    id: "startup-oklo",
    name: "Oklo",
    homepage: "https://oklo.com/",
    category: "energy",
    sources: [
      "https://en.wikipedia.org/wiki/Oklo_Inc.",
      "https://oklo.com/about",
    ],
    region: null,
    stage: null,
    logoUrl:
      "https://cdn.sanity.io/images/lxzjf5ub/production/1183abab260b75d67553d81673764dd8e632946b-1264x963.png?w=1200&h=630&fit=crop&crop=focalpoint&auto=format",
  }),
  seed({
    id: "startup-emerald-ai",
    name: "Emerald AI",
    homepage: "https://www.emeraldai.co/",
    category: "energy",
    sources: [
      "https://www.emeraldai.co/blog/sharing-our-strategic-expansion-round-emerald-ai-raises-25-million-to-transform-ai-data-centers-into-flexible-power-grid-assets",
      "https://www.datacenterdynamics.com/en/analysis/in-perfect-harmony-how-emerald-ai-is-turning-data-centers-into-flexible-grid-assets/",
    ],
    region: null,
    stage: null,
    logoUrl:
      "https://cdn.prod.website-files.com/68f069ba4a6142fc9e37da1e/68f1d7c60982cb1c841bec4e_EM_256.svg",
  }),
  seed({
    id: "startup-anthropic",
    name: "Anthropic",
    homepage: "https://www.anthropic.com/",
    category: "models",
    sources: [
      "https://en.wikipedia.org/wiki/Anthropic",
      "https://www.anthropic.com/company",
      "https://techcrunch.com/tag/anthropic/",
    ],
    region: null,
    stage: null,
    logoUrl:
      "https://cdn.prod.website-files.com/67ce28cfec624e2b733f8a52/68309ab48369f7ad9b4a40e1_open-graph.jpg",
  }),
  seed({
    id: "startup-mistral-ai",
    name: "Mistral AI",
    homepage: "https://mistral.ai/",
    category: "models",
    sources: [
      "https://en.wikipedia.org/wiki/Mistral_AI",
      "https://mistral.ai/about/",
      "https://techcrunch.com/tag/mistral/",
    ],
    region: null,
    stage: null,
    logoUrl: "https://mistral.ai/cms-media/api/media/file/OG-mistral-main_1x.jpg",
  }),
  seed({
    id: "startup-cohere",
    name: "Cohere",
    homepage: "https://cohere.com/",
    category: "models",
    sources: [
      "https://en.wikipedia.org/wiki/Cohere",
      "https://cohere.com/about",
      "https://cohere.com/blog",
    ],
    region: "Toronto, Canada",
    stage: null,
    logoUrl:
      "https://cdn.sanity.io/images/rjtqmwfu/web3-prod/85811b8ce33b1579bac01f1fe8f4989c2749d6ba-1200x630.png?w=1200&h=630&q=80&fit=crop&auto=format",
  }),
  seed({
    id: "startup-hugging-face",
    name: "Hugging Face",
    homepage: "https://huggingface.co/",
    category: "ai-infra",
    sources: [
      "https://en.wikipedia.org/wiki/Hugging_Face",
      "https://huggingface.co/blog",
      "https://techcrunch.com/tag/hugging-face/",
    ],
    region: null,
    stage: null,
    logoUrl: "https://huggingface.co/front/thumbnails/v2-2.png",
  }),
  seed({
    id: "startup-langchain",
    name: "LangChain",
    homepage: "https://www.langchain.com/",
    category: "ai-infra",
    sources: [
      "https://en.wikipedia.org/wiki/LangChain",
      "https://www.langchain.com/about",
      "https://www.langchain.com/blog",
    ],
    region: null,
    stage: null,
    logoUrl:
      "https://cdn.prod.website-files.com/65b8cd72835ceeacd4449a53/6a907b277587adb77be09e34_Website%20preview%20.png",
  }),
  seed({
    id: "startup-pinecone",
    name: "Pinecone",
    homepage: "https://www.pinecone.io/",
    category: "ai-infra",
    sources: [
      "https://www.pinecone.io/company/",
      "https://techcrunch.com/tag/pinecone/",
    ],
    region: "New York, US",
    stage: null,
    logoUrl:
      "https://www.pinecone.io/api/og/?title=The+vector+database+for&highlight=scale+in+production&alignment=center",
  }),
  seed({
    id: "startup-weaviate",
    name: "Weaviate",
    homepage: "https://weaviate.io/",
    category: "ai-infra",
    sources: [
      "https://weaviate.io/company/",
      "https://weaviate.io/blog",
      "https://techcrunch.com/2022/02/22/semi-technologies-search-engine-data/",
    ],
    region: null,
    stage: null,
    logoUrl: "https://weaviate.io/og/website/home.jpg",
  }),
  seed({
    id: "startup-fireworks-ai",
    name: "Fireworks AI",
    homepage: "https://fireworks.ai/",
    category: "ai-infra",
    sources: [
      "https://fireworks.ai/blog",
      "https://techcrunch.com/2024/03/26/fireworks-ai-open-source-api-puts-generative-ai-in-reach-of-any-developer/",
      "https://fireworks.ai/blog/fireworks-ai-series-b-compound-ai",
    ],
    region: null,
    stage: null,
    logoUrl:
      "https://cdn.sanity.io/images/pv37i0yn/production/9557e447af01a9b49c5ea1393ee212c8bc0d2396-1600x900.png",
  }),
  seed({
    id: "startup-perplexity",
    name: "Perplexity",
    homepage: "https://www.perplexity.ai/",
    category: "vertical",
    sources: [
      "https://en.wikipedia.org/wiki/Perplexity_AI",
      "https://www.perplexity.ai/hub",
      "https://techcrunch.com/tag/perplexity/",
    ],
    region: null,
    stage: null,
    logoUrl:
      "https://ppl-ai-public.s3.amazonaws.com/static/img/pplx-default-preview.png",
  }),
  seed({
    id: "startup-cursor-anysphere",
    name: "Cursor (Anysphere)",
    homepage: "https://cursor.com/",
    category: "agents",
    sources: [
      "https://en.wikipedia.org/wiki/Cursor_(code_editor)",
      "https://cursor.com/about",
      "https://cursor.com/blog",
    ],
    region: null,
    stage: null,
    logoUrl:
      "https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/og/opengraph-default.png",
  }),
];

const overflowHomepages = new Set<string>(STARTUPS_V1_OVERFLOW_HOMEPAGES);
for (const row of STARTUPS_V1_SEEDS) {
  if (overflowHomepages.has(row.homepage)) {
    throw new Error(`Startups v1 seed includes overflow homepage ${row.homepage}`);
  }
}

export function startupsV1PublicCards(): StartupPublicCard[] {
  return STARTUPS_V1_SEEDS.map((row) => {
    const coords = resolveStartupPinCoords({
      region: row.region,
      lat: null,
      lng: null,
    });
    return {
      id: row.id,
      name: row.name,
      homepage: row.homepage,
      category: row.category,
      sources: row.sources,
      region: row.region,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      stage: row.stage,
      logoUrl: row.logoUrl,
      listedOn: row.listedOn,
    };
  });
}
