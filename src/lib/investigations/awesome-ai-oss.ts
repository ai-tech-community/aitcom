import { AWESOME_AI_OSS_SEEDS_CHUNK_1 } from "./awesome-ai-oss-seeds-chunk-1";
import { AWESOME_AI_OSS_SEEDS_CHUNK_2 } from "./awesome-ai-oss-seeds-chunk-2";
import { AWESOME_AI_OSS_SEEDS_CHUNK_3 } from "./awesome-ai-oss-seeds-chunk-3";

export const AWESOME_AI_OSS_PATH = "/investigations/awesome-ai-oss";

export const AWESOME_AI_OSS_REVIEW_PATH =
  "/investigations/awesome-ai-oss/review";

export const AWESOME_AI_OSS_H1 = "Awesome AI OSS for AIT builders";

export const AWESOME_AI_OSS_META =
  "A short curated map of open-source building blocks for human + agent pairs. Live GitHub and GitLab only. Not a registry and not a star-sorted dump.";

export const AWESOME_AI_OSS_JOIN_HREF = "https://www.aitcommunity.org/en/join";

export const AWESOME_AI_OSS_BLURB_MAX = 160;

export type AwesomeLocale = "en" | "nl";

export type AwesomeCategoryId =
  | "protocols"
  | "runtimes"
  | "frameworks"
  | "rag"
  | "models"
  | "rag"
  | "agent-uis"
  | "agent-tools"
  | "eval-observability"
  | "other";

export type AwesomeProjectStatus = "pending" | "approved" | "rejected";

export type AwesomeProjectSource = "curated" | "member";

export type AwesomeSort = "newest" | "voted";

export type AwesomeRepo = {
  href: string;
  name: string;
  blurb: Record<AwesomeLocale, string>;
};

export type AwesomeSeed = AwesomeRepo & {
  id: string;
  category: AwesomeCategoryId;
  /** Frozen calendar date (YYYY-MM-DD) when the project shipped / was listed. */
  addedOn: string;
};

export type AwesomePublicCard = {
  id: string;
  name: string;
  repoUrl: string;
  category: AwesomeCategoryId;
  blurb: Record<AwesomeLocale, string>;
  addedOn: string;
  source: AwesomeProjectSource;
};

export type AwesomeDirectoryQuery = {
  q: string;
  category: AwesomeCategoryId | "all";
  sort: AwesomeSort;
};

export const AWESOME_CATEGORY_IDS = [
  "protocols",
  "runtimes",
  "frameworks",
  "rag",
  "models",
  "rag",
  "agent-uis",
  "agent-tools",
  "eval-observability",
  "other",
] as const satisfies readonly AwesomeCategoryId[];

/** Writing Bot labels — English is the source of truth. */
export const AWESOME_CATEGORY_LABELS: Record<
  AwesomeCategoryId,
  Record<AwesomeLocale, string>
> = {
  protocols: { en: "Protocols & SDKs", nl: "Protocollen & SDK’s" },
  runtimes: {
    en: "MCP servers & runtimes",
    nl: "MCP-servers & runtimes",
  },
  frameworks: { en: "Agent frameworks", nl: "Agentframeworks" },
  rag: { en: "RAG & memory", nl: "RAG & geheugen" },
  models: { en: "Open models & serving", nl: "Open modellen & serving" },
  rag: { en: "RAG & memory", nl: "RAG & geheugen" },
  "agent-uis": { en: "Agent UIs & chat", nl: "Agent-UI’s & chat" },
  "agent-tools": {
    en: "Agent tools & crawlers",
    nl: "Agenttools & crawlers",
  },
  "eval-observability": {
    en: "Eval & observability",
    nl: "Eval & observatie",
  },
  other: { en: "Other", nl: "Overig" },
};

/**
 * Curated seeds (v1 15 + chunk 1 + chunk 2 + chunk 3 GitHub), approved and listed.
 * `addedOn` is a frozen GitHub/GitLab created date — not a popularity signal.
 */
export const AWESOME_AI_OSS_SEEDS_V1: readonly AwesomeSeed[] = [
  {
    id: "curated-mcp-servers",
    name: "modelcontextprotocol/servers",
    href: "https://github.com/modelcontextprotocol/servers",
    category: "protocols",
    addedOn: "2024-11-25",
    blurb: {
      en: "Reference MCP servers",
      nl: "Referentie-MCP-servers",
    },
  },
  {
    id: "curated-mcp-python-sdk",
    name: "modelcontextprotocol/python-sdk",
    href: "https://github.com/modelcontextprotocol/python-sdk",
    category: "protocols",
    addedOn: "2024-11-19",
    blurb: {
      en: "Official Python SDK",
      nl: "Officiële Python-SDK",
    },
  },
  {
    id: "curated-mcp-typescript-sdk",
    name: "modelcontextprotocol/typescript-sdk",
    href: "https://github.com/modelcontextprotocol/typescript-sdk",
    category: "protocols",
    addedOn: "2024-11-19",
    blurb: {
      en: "Official TS SDK",
      nl: "Officiële TS-SDK",
    },
  },
  {
    id: "curated-fastmcp",
    name: "PrefectHQ/fastmcp",
    href: "https://github.com/PrefectHQ/fastmcp",
    category: "runtimes",
    addedOn: "2024-04-08",
    blurb: {
      en: "FastMCP server/client framework",
      nl: "FastMCP server/client-framework",
    },
  },
  {
    id: "curated-mcp-agent",
    name: "lastmile-ai/mcp-agent",
    href: "https://github.com/lastmile-ai/mcp-agent",
    category: "runtimes",
    addedOn: "2024-12-10",
    blurb: {
      en: "MCP-native agent patterns",
      nl: "MCP-native agentpatronen",
    },
  },
  {
    id: "curated-lazy-mcp",
    name: "gitlab-org/ai/lazy-mcp",
    href: "https://gitlab.com/gitlab-org/ai/lazy-mcp",
    category: "runtimes",
    addedOn: "2025-03-15",
    blurb: {
      en: "GitLab Lazy MCP",
      nl: "GitLab Lazy MCP",
    },
  },
  {
    id: "curated-openai-agents",
    name: "openai/openai-agents-python",
    href: "https://github.com/openai/openai-agents-python",
    category: "frameworks",
    addedOn: "2025-03-11",
    blurb: {
      en: "OpenAI Agents SDK (+ MCP)",
      nl: "OpenAI Agents SDK (+ MCP)",
    },
  },
  {
    id: "curated-ms-agent-framework",
    name: "microsoft/agent-framework",
    href: "https://github.com/microsoft/agent-framework",
    category: "frameworks",
    addedOn: "2025-10-01",
    blurb: {
      en: "Multi-agent workflows",
      nl: "Multi-agent-workflows",
    },
  },
  {
    id: "curated-langgraph",
    name: "langchain-ai/langgraph",
    href: "https://github.com/langchain-ai/langgraph",
    category: "frameworks",
    addedOn: "2024-01-17",
    blurb: {
      en: "Stateful agent graphs",
      nl: "Stateful agent-graphs",
    },
  },
  {
    id: "curated-transformers",
    name: "huggingface/transformers",
    href: "https://github.com/huggingface/transformers",
    category: "models",
    addedOn: "2018-11-08",
    blurb: {
      en: "Models & tooling",
      nl: "Modellen en tooling",
    },
  },
  {
    id: "curated-vllm",
    name: "vllm-project/vllm",
    href: "https://github.com/vllm-project/vllm",
    category: "models",
    addedOn: "2023-06-20",
    blurb: {
      en: "Open model serving",
      nl: "Open-model-serving",
    },
  },
  {
    id: "curated-ollama",
    name: "ollama/ollama",
    href: "https://github.com/ollama/ollama",
    category: "models",
    addedOn: "2023-07-01",
    blurb: {
      en: "Local model run",
      nl: "Lokaal model draaien",
    },
  },
  {
    id: "curated-a2a",
    name: "google/A2A",
    href: "https://github.com/google/A2A",
    category: "models",
    addedOn: "2025-04-09",
    blurb: {
      en: "Agent-to-agent protocol",
      nl: "Agent-to-agent-protocol",
    },
  },
  {
    id: "curated-gitlab-ai-assist",
    name: "gitlab-org/modelops/applied-ml/code-suggestions/ai-assist",
    href: "https://gitlab.com/gitlab-org/modelops/applied-ml/code-suggestions/ai-assist",
    category: "other",
    addedOn: "2023-05-01",
    blurb: {
      en: "GitLab AI Gateway for Duo / AI features",
      nl: "GitLab AI Gateway voor Duo / AI-features",
    },
  },
  {
    id: "curated-gitlab",
    name: "gitlab-org/gitlab",
    href: "https://gitlab.com/gitlab-org/gitlab",
    category: "other",
    addedOn: "2014-10-08",
    blurb: {
      en: "GitLab application",
      nl: "GitLab-applicatie",
    },
  },
] as const satisfies readonly AwesomeSeed[];

export const AWESOME_AI_OSS_SEEDS: readonly AwesomeSeed[] = [
  ...AWESOME_AI_OSS_SEEDS_V1,
  ...AWESOME_AI_OSS_SEEDS_CHUNK_1,
  ...AWESOME_AI_OSS_SEEDS_CHUNK_2,
  ...AWESOME_AI_OSS_SEEDS_CHUNK_3,
];

export const AWESOME_AI_OSS_REPOS: readonly AwesomeRepo[] =
  AWESOME_AI_OSS_SEEDS.map(({ href, name, blurb }) => ({ href, name, blurb }));

export type AwesomeCategory = {
  id: AwesomeCategoryId;
  headingKey: AwesomeCategoryId;
  repos: readonly AwesomeRepo[];
};

export const AWESOME_AI_OSS_CATEGORIES: readonly AwesomeCategory[] =
  AWESOME_CATEGORY_IDS.map((id) => ({
    id,
    headingKey: id,
    repos: AWESOME_AI_OSS_SEEDS.filter((seed) => seed.category === id).map(
      ({ href, name, blurb }) => ({ href, name, blurb }),
    ),
  }));

export function curatedPublicCards(): AwesomePublicCard[] {
  return AWESOME_AI_OSS_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    repoUrl: seed.href,
    category: seed.category,
    blurb: seed.blurb,
    addedOn: seed.addedOn,
    source: "curated",
  }));
}

export function formatAwesomeAddedDate(
  addedOn: string,
  locale: AwesomeLocale,
): string {
  const date = new Date(`${addedOn}T12:00:00.000Z`);
  const formatted = new Intl.DateTimeFormat(
    locale === "nl" ? "nl-NL" : "en-US",
    { month: "long", day: "numeric", year: "numeric" },
  ).format(date);
  return locale === "nl" ? `Toegevoegd: ${formatted}` : `Added: ${formatted}`;
}

export function isAwesomeCategoryId(
  value: string | null | undefined,
): value is AwesomeCategoryId {
  return (
    value != null && (AWESOME_CATEGORY_IDS as readonly string[]).includes(value)
  );
}

export function parseAwesomeDirectoryQuery(
  raw: {
    q?: string | string[];
    category?: string | string[];
    sort?: string | string[];
  },
  signedIn: boolean,
): AwesomeDirectoryQuery {
  const q = firstParam(raw.q)?.trim() ?? "";
  const categoryRaw = firstParam(raw.category);
  const category = isAwesomeCategoryId(categoryRaw) ? categoryRaw : "all";
  const sortRaw = firstParam(raw.sort);
  const sort: AwesomeSort =
    signedIn && sortRaw === "voted" ? "voted" : "newest";
  return { q, category, sort };
}

export function applyAwesomeDirectoryQuery(
  cards: readonly AwesomePublicCard[],
  query: AwesomeDirectoryQuery,
  locale: AwesomeLocale,
  voteCounts?: Readonly<Record<string, number>>,
): AwesomePublicCard[] {
  const needle = query.q.trim().toLowerCase();
  const filtered = cards.filter((card) => {
    if (query.category !== "all" && card.category !== query.category) {
      return false;
    }
    if (!needle) return true;
    const haystack = [
      card.name,
      card.repoUrl,
      card.blurb.en,
      card.blurb.nl,
      AWESOME_CATEGORY_LABELS[card.category][locale],
      AWESOME_CATEGORY_LABELS[card.category].en,
    ]
      .join("\n")
      .toLowerCase();
    return haystack.includes(needle);
  });

  const sorted = [...filtered];
  if (query.sort === "voted" && voteCounts) {
    sorted.sort((a, b) => {
      const voteDelta = (voteCounts[b.id] ?? 0) - (voteCounts[a.id] ?? 0);
      if (voteDelta !== 0) return voteDelta;
      return compareNewest(a, b);
    });
    return sorted;
  }

  sorted.sort(compareNewest);
  return sorted;
}

function compareNewest(a: AwesomePublicCard, b: AwesomePublicCard) {
  if (a.addedOn === b.addedOn) return a.name.localeCompare(b.name);
  return a.addedOn < b.addedOn ? 1 : -1;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
