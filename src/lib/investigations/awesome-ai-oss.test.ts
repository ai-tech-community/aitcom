import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AWESOME_AI_OSS_SEEDS,
  AWESOME_AI_OSS_SEEDS_V1,
  applyAwesomeDirectoryQuery,
  curatedPublicCards,
  formatAwesomeAddedDate,
  parseAwesomeDirectoryQuery,
} from "./awesome-ai-oss";
import { AWESOME_AI_OSS_SEEDS_CHUNK_1 } from "./awesome-ai-oss-seeds-chunk-1";

const CHUNK_1_MIGRATION = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../migrations/20260914a_awesome_ai_oss_seeds_chunk_1.ts",
  ),
  "utf8",
);

const CHUNK_1_EXPECTED = [
  {
    name: "MCP Specification",
    href: "https://github.com/modelcontextprotocol/specification",
    category: "protocols",
    blurb: "Official MCP specification and protocol docs",
  },
  {
    name: "MCP Inspector",
    href: "https://github.com/modelcontextprotocol/inspector",
    category: "runtimes",
    blurb: "Visual debugger/inspector for MCP servers",
  },
  {
    name: "modelcontextprotocol/create-python-server",
    href: "https://github.com/modelcontextprotocol/create-python-server",
    category: "protocols",
    blurb: "Cookiecutter to scaffold a Python MCP server",
  },
  {
    name: "modelcontextprotocol/create-typescript-server",
    href: "https://github.com/modelcontextprotocol/create-typescript-server",
    category: "protocols",
    blurb: "Scaffold for TypeScript MCP servers",
  },
  {
    name: "modelcontextprotocol/csharp-sdk",
    href: "https://github.com/modelcontextprotocol/csharp-sdk",
    category: "protocols",
    blurb: "Official C# SDK for Model Context Protocol",
  },
  {
    name: "modelcontextprotocol/java-sdk",
    href: "https://github.com/modelcontextprotocol/java-sdk",
    category: "protocols",
    blurb: "Official Java SDK for Model Context Protocol",
  },
  {
    name: "modelcontextprotocol/kotlin-sdk",
    href: "https://github.com/modelcontextprotocol/kotlin-sdk",
    category: "protocols",
    blurb: "Official Kotlin SDK for Model Context Protocol",
  },
  {
    name: "modelcontextprotocol/go-sdk",
    href: "https://github.com/modelcontextprotocol/go-sdk",
    category: "protocols",
    blurb: "Official Go SDK for Model Context Protocol",
  },
  {
    name: "modelcontextprotocol/ruby-sdk",
    href: "https://github.com/modelcontextprotocol/ruby-sdk",
    category: "protocols",
    blurb: "Official Ruby SDK for Model Context Protocol",
  },
  {
    name: "modelcontextprotocol/rust-sdk",
    href: "https://github.com/modelcontextprotocol/rust-sdk",
    category: "protocols",
    blurb: "Official Rust SDK for Model Context Protocol",
  },
  {
    name: "modelcontextprotocol/swift-sdk",
    href: "https://github.com/modelcontextprotocol/swift-sdk",
    category: "protocols",
    blurb: "Official Swift SDK for Model Context Protocol",
  },
  {
    name: "modelcontextprotocol/php-sdk",
    href: "https://github.com/modelcontextprotocol/php-sdk",
    category: "protocols",
    blurb: "Official PHP SDK for Model Context Protocol",
  },
  {
    name: "mcp-go",
    href: "https://github.com/mark3labs/mcp-go",
    category: "protocols",
    blurb: "Go SDK and helpers for building MCP servers/clients",
  },
  {
    name: "punkpeye/fastmcp",
    href: "https://github.com/punkpeye/fastmcp",
    category: "runtimes",
    blurb: "TypeScript framework for building MCP servers fast",
  },
  {
    name: "GitHub MCP Server",
    href: "https://github.com/github/github-mcp-server",
    category: "runtimes",
    blurb: "Official GitHub MCP server for repo and issue tools",
  },
  {
    name: "cloudflare/mcp-server-cloudflare",
    href: "https://github.com/cloudflare/mcp-server-cloudflare",
    category: "runtimes",
    blurb: "Cloudflare MCP servers for Workers and platform APIs",
  },
  {
    name: "neondatabase/mcp-server-neon",
    href: "https://github.com/neondatabase/mcp-server-neon",
    category: "runtimes",
    blurb: "Official Neon Postgres MCP server",
  },
  {
    name: "stripe/agent-toolkit",
    href: "https://github.com/stripe/agent-toolkit",
    category: "runtimes",
    blurb: "Stripe agent toolkit with MCP server support",
  },
  {
    name: "getsentry/sentry-mcp",
    href: "https://github.com/getsentry/sentry-mcp",
    category: "runtimes",
    blurb: "Sentry MCP server for error and issue context",
  },
  {
    name: "browserbase/mcp-server-browserbase",
    href: "https://github.com/browserbase/mcp-server-browserbase",
    category: "runtimes",
    blurb: "Browserbase MCP server for cloud browsers",
  },
  {
    name: "microsoft/mcp",
    href: "https://github.com/microsoft/mcp",
    category: "runtimes",
    blurb: "Microsoft MCP servers and tooling monorepo",
  },
  {
    name: "anthropics/anthropic-quickstarts",
    href: "https://github.com/anthropics/anthropic-quickstarts",
    category: "runtimes",
    blurb: "Anthropic quickstarts including computer-use patterns",
  },
  {
    name: "langchain-ai/langchain-mcp-adapters",
    href: "https://github.com/langchain-ai/langchain-mcp-adapters",
    category: "protocols",
    blurb: "Adapters to use MCP tools inside LangChain agents",
  },
  {
    name: "mcp-use/mcp-use",
    href: "https://github.com/mcp-use/mcp-use",
    category: "runtimes",
    blurb: "SDK to connect any LLM to MCP servers and build agents",
  },
  {
    name: "geelen/mcp-remote",
    href: "https://github.com/geelen/mcp-remote",
    category: "runtimes",
    blurb: "Remote/proxy bridge for MCP over HTTP",
  },
  {
    name: "sparfenyuk/mcp-proxy",
    href: "https://github.com/sparfenyuk/mcp-proxy",
    category: "runtimes",
    blurb: "Proxy that bridges MCP stdio and SSE transports",
  },
  {
    name: "mcpo",
    href: "https://github.com/open-webui/mcpo",
    category: "runtimes",
    blurb: "Expose MCP tools as OpenAPI/HTTP for any client",
  },
  {
    name: "wong2/mcp-cli",
    href: "https://github.com/wong2/mcp-cli",
    category: "runtimes",
    blurb: "CLI client for interacting with MCP servers",
  },
  {
    name: "awslabs/mcp",
    href: "https://github.com/awslabs/mcp",
    category: "runtimes",
    blurb: "AWS Labs MCP servers for AWS services",
  },
  {
    name: "sooperset/mcp-atlassian",
    href: "https://github.com/sooperset/mcp-atlassian",
    category: "runtimes",
    blurb: "MCP server for Jira and Confluence",
  },
  {
    name: "isaacphi/mcp-gdrive",
    href: "https://github.com/isaacphi/mcp-gdrive",
    category: "runtimes",
    blurb: "Google Drive MCP server for docs and files",
  },
  {
    name: "aashari/mcp-server-atlassian-jira",
    href: "https://github.com/aashari/mcp-server-atlassian-jira",
    category: "runtimes",
    blurb: "Atlassian Jira MCP server",
  },
  {
    name: "JetBrains/mcpProxy",
    href: "https://github.com/JetBrains/mcpProxy",
    category: "runtimes",
    blurb: "JetBrains IDE MCP proxy for coding agents",
  },
  {
    name: "oraios/serena",
    href: "https://github.com/oraios/serena",
    category: "runtimes",
    blurb: "Coding-agent toolkit with MCP-based code intelligence",
  },
  {
    name: "executeautomation/mcp-playwright",
    href: "https://github.com/executeautomation/mcp-playwright",
    category: "runtimes",
    blurb: "Playwright MCP server for browser automation",
  },
  {
    name: "Context7",
    href: "https://github.com/upstash/context7",
    category: "runtimes",
    blurb: "Context7 MCP server for up-to-date library docs",
  },
  {
    name: "qdrant/mcp-server-qdrant",
    href: "https://github.com/qdrant/mcp-server-qdrant",
    category: "runtimes",
    blurb: "Official Qdrant MCP server for vector search",
  },
  {
    name: "chroma-core/chroma-mcp",
    href: "https://github.com/chroma-core/chroma-mcp",
    category: "runtimes",
    blurb: "Chroma MCP server for embeddings and collections",
  },
  {
    name: "prisma/mcp",
    href: "https://github.com/prisma/mcp",
    category: "runtimes",
    blurb: "Prisma MCP server for database workflows",
  },
  {
    name: "mongodb-js/mongodb-mcp-server",
    href: "https://github.com/mongodb-js/mongodb-mcp-server",
    category: "runtimes",
    blurb: "Official MongoDB MCP server",
  },
  {
    name: "redis/mcp-redis",
    href: "https://github.com/redis/mcp-redis",
    category: "runtimes",
    blurb: "Official Redis MCP server",
  },
  {
    name: "elastic/mcp-server-elasticsearch",
    href: "https://github.com/elastic/mcp-server-elasticsearch",
    category: "runtimes",
    blurb: "Elasticsearch MCP server",
  },
  {
    name: "ppl-ai/modelcontextprotocol",
    href: "https://github.com/ppl-ai/modelcontextprotocol",
    category: "runtimes",
    blurb: "Perplexity MCP server for web search answers",
  },
  {
    name: "exa-labs/exa-mcp-server",
    href: "https://github.com/exa-labs/exa-mcp-server",
    category: "runtimes",
    blurb: "Exa MCP server for neural web search",
  },
  {
    name: "apify/actors-mcp-server",
    href: "https://github.com/apify/actors-mcp-server",
    category: "runtimes",
    blurb: "Apify Actors MCP server for web scraping actors",
  },
  {
    name: "firecrawl/firecrawl-mcp-server",
    href: "https://github.com/firecrawl/firecrawl-mcp-server",
    category: "runtimes",
    blurb: "Firecrawl MCP server for crawl-to-markdown",
  },
  {
    name: "vercel/mcp-handler",
    href: "https://github.com/vercel/mcp-handler",
    category: "protocols",
    blurb: "Helpers to host MCP servers on Vercel",
  },
  {
    name: "cloudflare/agents",
    href: "https://github.com/cloudflare/agents",
    category: "protocols",
    blurb: "Cloudflare Agents SDK with MCP support",
  },
  {
    name: "jsonresume/mcp",
    href: "https://github.com/jsonresume/mcp",
    category: "runtimes",
    blurb: "JSON Resume MCP server",
  },
  {
    name: "metorial/mcp-containers",
    href: "https://github.com/metorial/mcp-containers",
    category: "runtimes",
    blurb: "Containerized MCP servers collection",
  },
] as const;

describe("Awesome AI OSS seeds", () => {
  it("keeps the locked 15 curated repos with frozen added dates", () => {
    expect(AWESOME_AI_OSS_SEEDS_V1).toHaveLength(15);
    expect(
      AWESOME_AI_OSS_SEEDS_V1.filter((seed) =>
        seed.href.includes("github.com"),
      ),
    ).toHaveLength(12);
    expect(
      AWESOME_AI_OSS_SEEDS_V1.filter((seed) =>
        seed.href.includes("gitlab.com"),
      ),
    ).toHaveLength(3);
    expect(new Set(AWESOME_AI_OSS_SEEDS_V1.map((seed) => seed.id)).size).toBe(
      15,
    );
    for (const seed of AWESOME_AI_OSS_SEEDS_V1) {
      expect(seed.addedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(seed.blurb.en.length).toBeGreaterThan(0);
    }
  });

  it("adds chunk 1 as 50 approved GitHub seeds without aliases or invented counts", () => {
    expect(CHUNK_1_EXPECTED).toHaveLength(50);
    expect(AWESOME_AI_OSS_SEEDS_CHUNK_1).toHaveLength(50);
    expect(AWESOME_AI_OSS_SEEDS).toHaveLength(65);
    expect(curatedPublicCards()).toHaveLength(65);

    const v1Urls = new Set<string>(
      AWESOME_AI_OSS_SEEDS_V1.map((seed) => seed.href),
    );
    const chunkUrls = AWESOME_AI_OSS_SEEDS_CHUNK_1.map((seed) => seed.href);
    expect(new Set(chunkUrls).size).toBe(50);
    expect(
      chunkUrls.every((href) => href.startsWith("https://github.com/")),
    ).toBe(true);
    expect(chunkUrls.some((href) => v1Urls.has(href))).toBe(false);
    expect(chunkUrls).not.toContain("https://github.com/jlowin/fastmcp");
    expect(chunkUrls).not.toContain("https://github.com/PrefectHQ/fastmcp");
    expect(chunkUrls).toContain("https://github.com/punkpeye/fastmcp");

    expect(
      AWESOME_AI_OSS_SEEDS_CHUNK_1.map((seed) => ({
        name: seed.name,
        href: seed.href,
        category: seed.category,
        blurb: seed.blurb.en,
      })),
    ).toEqual([...CHUNK_1_EXPECTED]);

    for (const seed of AWESOME_AI_OSS_SEEDS_CHUNK_1) {
      expect(seed.id.startsWith("curated-")).toBe(true);
      expect(seed.addedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(seed.blurb.nl.trim().length).toBeGreaterThan(0);
      expect(`${seed.blurb.en}\n${seed.blurb.nl}`).not.toMatch(
        /\b(stars?|★|largest)\b/i,
      );
      expect(["protocols", "runtimes"]).toContain(seed.category);
    }

    expect(new Set(AWESOME_AI_OSS_SEEDS.map((seed) => seed.id)).size).toBe(65);
    expect(new Set(AWESOME_AI_OSS_SEEDS.map((seed) => seed.href)).size).toBe(
      65,
    );
  });

  it("seeds chunk 1 through an additive approved curated migration", () => {
    expect(CHUNK_1_MIGRATION).toContain("AWESOME_AI_OSS_SEEDS_CHUNK_1");
    expect(CHUNK_1_MIGRATION).toContain("ON CONFLICT");
    expect(CHUNK_1_MIGRATION).toContain("approved");
    expect(CHUNK_1_MIGRATION).toContain("curated");
    expect(CHUNK_1_MIGRATION).not.toContain("jlowin/fastmcp");
    expect(CHUNK_1_MIGRATION).not.toMatch(/\bstargazers\b/);
    expect(CHUNK_1_MIGRATION).not.toMatch(/\bstars?\b/i);
    expect(CHUNK_1_MIGRATION).toContain("awesome_ai_oss_project");
  });
});

describe("parseAwesomeDirectoryQuery", () => {
  it("defaults to newest and all categories", () => {
    expect(parseAwesomeDirectoryQuery({}, false)).toEqual({
      q: "",
      category: "all",
      sort: "newest",
    });
  });

  it("ignores voted sort unless a Hub session exists", () => {
    expect(
      parseAwesomeDirectoryQuery(
        { sort: "voted", category: "runtimes" },
        false,
      ),
    ).toEqual({
      q: "",
      category: "runtimes",
      sort: "newest",
    });
    expect(parseAwesomeDirectoryQuery({ sort: "voted" }, true).sort).toBe(
      "voted",
    );
  });
});

describe("applyAwesomeDirectoryQuery", () => {
  const cards = curatedPublicCards();

  it("filters by category and search without using vote counts", () => {
    const protocols = applyAwesomeDirectoryQuery(
      cards,
      { q: "", category: "protocols", sort: "newest" },
      "en",
    );
    expect(protocols.every((card) => card.category === "protocols")).toBe(true);
    expect(protocols.map((card) => card.name)).toContain(
      "modelcontextprotocol/servers",
    );

    const searched = applyAwesomeDirectoryQuery(
      cards,
      { q: "vllm", category: "all", sort: "newest" },
      "en",
    );
    expect(searched.map((card) => card.id)).toEqual(["curated-vllm"]);
  });

  it("sorts newest first, and most-voted only when counts are provided", () => {
    const newest = applyAwesomeDirectoryQuery(
      cards,
      { q: "", category: "all", sort: "newest" },
      "en",
    );
    expect(newest[0]!.addedOn >= newest[1]!.addedOn).toBe(true);

    const voted = applyAwesomeDirectoryQuery(
      cards,
      { q: "", category: "all", sort: "voted" },
      "en",
      { "curated-ollama": 4, "curated-vllm": 1 },
    );
    expect(voted[0]?.id).toBe("curated-ollama");
    expect(voted[1]?.id).toBe("curated-vllm");
  });
});

describe("formatAwesomeAddedDate", () => {
  it("uses Writing Bot Added: Month D, YYYY in English", () => {
    expect(formatAwesomeAddedDate("2024-11-25", "en")).toBe(
      "Added: November 25, 2024",
    );
  });
});
