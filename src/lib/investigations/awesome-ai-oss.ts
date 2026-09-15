import { AWESOME_AI_OSS_SEEDS_CHUNK_1 } from "./awesome-ai-oss-seeds-chunk-1";
import { AWESOME_AI_OSS_SEEDS_CHUNK_2 } from "./awesome-ai-oss-seeds-chunk-2";
import { AWESOME_AI_OSS_SEEDS_CHUNK_3 } from "./awesome-ai-oss-seeds-chunk-3";
import { AWESOME_AI_OSS_SEEDS_CHUNK_4 } from "./awesome-ai-oss-seeds-chunk-4";
import { AWESOME_AI_OSS_SEEDS_CHUNK_5 } from "./awesome-ai-oss-seeds-chunk-5";
import { AWESOME_AI_OSS_SEEDS_CHUNK_6 } from "./awesome-ai-oss-seeds-chunk-6";
import {
  AWESOME_AI_OSS_CURATED_SOURCES,
  sanitizeAwesomeSources,
  type AwesomeSource,
} from "./awesome-ai-oss-sources";
import { parseAwesomeRepoUrl } from "./awesome-ai-oss-url";

export const AWESOME_AI_OSS_PATH = "/investigations/awesome-ai-oss";

export const AWESOME_AI_OSS_REVIEW_PATH =
  "/investigations/awesome-ai-oss/review";

export const AWESOME_AI_OSS_INSIGHTS_PATH =
  "/investigations/awesome-ai-oss/insights";

export const AWESOME_AI_OSS_H1 = "Awesome AI OSS for AIT builders";

export const AWESOME_AI_OSS_META =
  "A short curated map of open-source building blocks for human + agent pairs. Live GitHub and GitLab only. Not a registry and not a star-sorted dump.";

export const AWESOME_AI_OSS_INSIGHTS_H1 = "Awesome AI OSS insights";

export const AWESOME_AI_OSS_INSIGHTS_META =
  "Category mix, GitHub vs GitLab, and when projects were added — from our curated list. Refreshed daily. Not a star-sorted dump.";

export const AWESOME_AI_OSS_JOIN_HREF = "https://www.aitcommunity.org/en/join";

export const AWESOME_AI_OSS_BLURB_MAX = 160;

/** Cards per crawlable directory page. Fits the 3-column grid (24–48). */
export const AWESOME_AI_OSS_PAGE_SIZE = 36;

export type AwesomeLocale = "en" | "nl";

export type AwesomeCategoryId =
  | "protocols"
  | "runtimes"
  | "frameworks"
  | "rag"
  | "models"
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

export type AwesomeRepoHost = "github" | "gitlab";

export type AwesomePublicCard = {
  id: string;
  name: string;
  repoUrl: string;
  repoHost: AwesomeRepoHost;
  category: AwesomeCategoryId;
  blurb: Record<AwesomeLocale, string>;
  addedOn: string;
  source: AwesomeProjectSource;
  /** Live GH/GL count only. Null until a fetch succeeds — never invented. */
  starCount: number | null;
  starsCheckedAt: string | null;
  sources: AwesomeSource[];
};

export type AwesomeDirectoryFilters = {
  q: string;
  category: AwesomeCategoryId | "all";
  sort: AwesomeSort;
};

export type AwesomeDirectoryQuery = AwesomeDirectoryFilters & {
  page: number;
};

export const AWESOME_CATEGORY_IDS = [
  "protocols",
  "runtimes",
  "frameworks",
  "rag",
  "models",
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
 * Curated seeds (v1 15 + chunk 1 + chunk 2 + chunk 3 + chunk 4 + chunk 5 + chunk 6 GitHub), approved and listed.
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
  ...AWESOME_AI_OSS_SEEDS_CHUNK_4,
  ...AWESOME_AI_OSS_SEEDS_CHUNK_5,
  ...AWESOME_AI_OSS_SEEDS_CHUNK_6,
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
  return AWESOME_AI_OSS_SEEDS.map((seed) => {
    const parsed = parseAwesomeRepoUrl(seed.href);
    return {
      id: seed.id,
      name: seed.name,
      repoUrl: seed.href,
      repoHost: parsed.ok
        ? parsed.value.host
        : seed.href.includes("gitlab.com")
          ? "gitlab"
          : "github",
      category: seed.category,
      blurb: seed.blurb,
      addedOn: seed.addedOn,
      source: "curated",
      starCount: null,
      starsCheckedAt: null,
      sources: sanitizeAwesomeSources(
        AWESOME_AI_OSS_CURATED_SOURCES[seed.id] ?? [],
      ),
    };
  });
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

export function parseAwesomePage(value: string | string[] | undefined): number {
  const raw = firstParam(value);
  if (!raw) return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

export function parseAwesomeDirectoryQuery(
  raw: {
    q?: string | string[];
    category?: string | string[];
    sort?: string | string[];
    page?: string | string[] | number;
  },
  signedIn: boolean,
): AwesomeDirectoryQuery {
  const q = firstParam(raw.q)?.trim() ?? "";
  const categoryRaw = firstParam(raw.category);
  const category = isAwesomeCategoryId(categoryRaw) ? categoryRaw : "all";
  const sortRaw = firstParam(raw.sort);
  const sort: AwesomeSort =
    signedIn && sortRaw === "voted" ? "voted" : "newest";
  const page =
    typeof raw.page === "number"
      ? raw.page >= 1 && Number.isFinite(raw.page)
        ? Math.floor(raw.page)
        : 1
      : parseAwesomePage(raw.page);
  return { q, category, sort, page };
}

export function applyAwesomeDirectoryQuery(
  cards: readonly AwesomePublicCard[],
  query: AwesomeDirectoryFilters,
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

export function paginateAwesomeCards<T>(
  cards: readonly T[],
  page: number,
  pageSize: number = AWESOME_AI_OSS_PAGE_SIZE,
): {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
} {
  const total = cards.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: cards.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
    pageSize,
  };
}

export function buildAwesomeDirectoryPath(
  query: Partial<AwesomeDirectoryQuery> = {},
  options: { signedIn?: boolean } = {},
): string {
  const parsed = parseAwesomeDirectoryQuery(query, Boolean(options.signedIn));
  const params = new URLSearchParams();
  if (parsed.q.trim()) params.set("q", parsed.q.trim());
  if (parsed.category !== "all") params.set("category", parsed.category);
  if (options.signedIn && parsed.sort === "voted") params.set("sort", "voted");
  if (parsed.page > 1) params.set("page", String(parsed.page));
  const qs = params.toString();
  return qs ? `${AWESOME_AI_OSS_PATH}?${qs}` : AWESOME_AI_OSS_PATH;
}

export function awesomeDirectoryHasFilters(
  query: AwesomeDirectoryQuery,
): boolean {
  return (
    query.q.trim().length > 0 ||
    query.category !== "all" ||
    query.sort === "voted"
  );
}

export function awesomeDirectoryCanonicalPath(
  query: AwesomeDirectoryQuery,
): string {
  if (awesomeDirectoryHasFilters(query)) {
    return AWESOME_AI_OSS_PATH;
  }
  if (query.page > 1) {
    return `${AWESOME_AI_OSS_PATH}?page=${query.page}`;
  }
  return AWESOME_AI_OSS_PATH;
}

export function awesomeDirectorySitemapPaths(
  totalCards: number,
  pageSize: number = AWESOME_AI_OSS_PAGE_SIZE,
): string[] {
  const totalPages = Math.max(1, Math.ceil(totalCards / pageSize) || 1);
  const paths: string[] = [];
  for (let page = 2; page <= totalPages; page++) {
    paths.push(`${AWESOME_AI_OSS_PATH}?page=${page}`);
  }
  return paths;
}

export function awesomeDirectoryPageNumbers(
  currentPage: number,
  totalPages: number,
): Array<number | "gap"> {
  const pages: Array<number | "gap"> = [];
  const push = (value: number | "gap") => {
    if (pages[pages.length - 1] !== value) pages.push(value);
  };
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - 1 && i <= currentPage + 1)
    ) {
      push(i);
    } else {
      push("gap");
    }
  }
  return pages;
}
