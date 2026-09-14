import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AWESOME_AI_OSS_BLURB_MAX,
  AWESOME_AI_OSS_SEEDS,
  AWESOME_AI_OSS_SEEDS_V1,
  AWESOME_CATEGORY_IDS,
  AWESOME_CATEGORY_LABELS,
  applyAwesomeDirectoryQuery,
  curatedPublicCards,
  formatAwesomeAddedDate,
  parseAwesomeDirectoryQuery,
} from "./awesome-ai-oss";
import { AWESOME_AI_OSS_SEEDS_CHUNK_1 } from "./awesome-ai-oss-seeds-chunk-1";
import { AWESOME_AI_OSS_SEEDS_CHUNK_3 } from "./awesome-ai-oss-seeds-chunk-3";

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

const V1_REPO_URLS = [
  "https://github.com/modelcontextprotocol/servers",
  "https://github.com/modelcontextprotocol/python-sdk",
  "https://github.com/modelcontextprotocol/typescript-sdk",
  "https://github.com/PrefectHQ/fastmcp",
  "https://github.com/lastmile-ai/mcp-agent",
  "https://gitlab.com/gitlab-org/ai/lazy-mcp",
  "https://github.com/openai/openai-agents-python",
  "https://github.com/microsoft/agent-framework",
  "https://github.com/langchain-ai/langgraph",
  "https://github.com/huggingface/transformers",
  "https://github.com/vllm-project/vllm",
  "https://github.com/ollama/ollama",
  "https://github.com/google/A2A",
  "https://gitlab.com/gitlab-org/modelops/applied-ml/code-suggestions/ai-assist",
  "https://gitlab.com/gitlab-org/gitlab",
] as const;

const CHUNK2_REPO_URLS = [
  "https://github.com/makenotion/notion-mcp-server",
  "https://github.com/devhub/devhub-cms-mcp",
  "https://github.com/heroku/heroku-mcp-server",
  "https://github.com/baidu-maps/mcp",
  "https://github.com/solana-foundation/solana-dev-mcp",
  "https://github.com/bankless/onchain-mcp",
  "https://github.com/comet-ml/opik-mcp",
  "https://github.com/dynatrace-oss/dynatrace-mcp",
  "https://github.com/grafana/mcp-grafana",
  "https://github.com/hashicorp/terraform-mcp-server",
  "https://github.com/aquasecurity/trivy-mcp",
  "https://github.com/huggingface/hf-mcp-server",
  "https://github.com/smithery-ai/cli",
  "https://github.com/mcpdotdirect/template-mcp-server",
  "https://github.com/cyanheads/atlas-mcp-server",
  "https://github.com/doobidoo/mcp-memory-service",
  "https://github.com/evalstate/mcp-miro",
  "https://github.com/ahujasid/blender-mcp",
  "https://github.com/MarkusPfundstein/mcp-obsidian",
  "https://github.com/pierrebrunelle/mcp-server-openai",
  "https://github.com/agno-agi/agno",
  "https://github.com/pydantic/pydantic-ai",
  "https://github.com/567-labs/instructor",
  "https://github.com/dottxt-ai/outlines",
  "https://github.com/stanfordnlp/dspy",
  "https://github.com/guidance-ai/guidance",
  "https://github.com/yoheinakajima/babyagi",
  "https://github.com/FoundationAgents/MetaGPT",
  "https://github.com/OpenBMB/ChatDev",
  "https://github.com/OpenHands/OpenHands",
  "https://github.com/SWE-agent/SWE-agent",
  "https://github.com/superagent-ai/superagent",
  "https://github.com/deepset-ai/haystack",
  "https://github.com/neuml/txtai",
  "https://github.com/zylon-ai/private-gpt",
  "https://github.com/The-Vibe-Company/quivr",
  "https://github.com/infiniflow/ragflow",
  "https://github.com/HKUDS/LightRAG",
  "https://github.com/microsoft/graphrag",
  "https://github.com/mem0ai/mem0",
  "https://github.com/getzep/graphiti",
  "https://github.com/letta-ai/letta",
  "https://github.com/topoteretes/cognee",
  "https://github.com/qdrant/qdrant",
  "https://github.com/milvus-io/milvus",
  "https://github.com/weaviate/weaviate",
  "https://github.com/chroma-core/chroma",
  "https://github.com/lancedb/lancedb",
  "https://github.com/pgvector/pgvector",
  "https://github.com/facebookresearch/faiss",
] as const;

const CHUNK3_HREFS = [
  "https://github.com/asg017/sqlite-vec",
  "https://github.com/Unstructured-IO/unstructured",
  "https://github.com/docling-project/docling",
  "https://github.com/microsoft/markitdown",
  "https://github.com/opendatalab/MinerU",
  "https://github.com/huggingface/sentence-transformers",
  "https://github.com/Mintplex-Labs/anything-llm",
  "https://github.com/khoj-ai/khoj",
  "https://github.com/assafelovic/gpt-researcher",
  "https://github.com/firecrawl/firecrawl",
  "https://github.com/browser-use/browser-use",
  "https://github.com/searxng/searxng",
  "https://github.com/jina-ai/reader",
  "https://github.com/langchain-ai/open_deep_research",
  "https://github.com/stanford-oval/storm",
  "https://github.com/langfuse/langfuse",
  "https://github.com/promptfoo/promptfoo",
  "https://github.com/vibrantlabsai/ragas",
  "https://github.com/confident-ai/deepeval",
  "https://github.com/Giskard-AI/giskard-oss",
  "https://github.com/truera/trulens",
  "https://github.com/Arize-ai/phoenix",
  "https://github.com/Helicone/helicone",
  "https://github.com/BerriAI/litellm",
  "https://github.com/Portkey-AI/gateway",
  "https://github.com/amazon-science/RAGChecker",
  "https://github.com/danny-avila/LibreChat",
  "https://github.com/unclecode/crawl4ai",
  "https://github.com/langchain-ai/langchain",
  "https://github.com/run-llama/llama_index",
  "https://github.com/microsoft/autogen",
  "https://github.com/crewAIInc/crewAI",
  "https://github.com/microsoft/semantic-kernel",
  "https://github.com/langgenius/dify",
  "https://github.com/open-webui/open-webui",
  "https://github.com/continuedev/continue",
  "https://github.com/Aider-AI/aider",
  "https://github.com/huggingface/smolagents",
  "https://github.com/langchain-ai/deepagents",
  "https://github.com/ag2ai/ag2",
  "https://github.com/camel-ai/camel",
  "https://github.com/mastra-ai/mastra",
  "https://github.com/elizaOS/eliza",
  "https://github.com/n8n-io/n8n",
  "https://github.com/griptape-ai/griptape",
  "https://github.com/google/adk-python",
  "https://github.com/Significant-Gravitas/AutoGPT",
  "https://github.com/FoundationAgents/OpenManus",
  "https://github.com/vercel/ai",
  "https://github.com/microsoft/TaskWeaver",
] as const;

describe("Awesome AI OSS seeds", () => {
  it("keeps the locked 15 curated repos with frozen added dates", () => {
    expect(AWESOME_AI_OSS_SEEDS_V1).toHaveLength(15);
    expect(
      AWESOME_AI_OSS_SEEDS_V1.filter((seed) =>
        seed.href.includes("github.com"),
      ),
    ).toHaveLength(12);
    const cards = curatedPublicCards();
    const urls = cards.map((card) => card.repoUrl);
    for (const href of V1_REPO_URLS) {
      expect(urls).toContain(href);
    }
    expect(
      AWESOME_AI_OSS_SEEDS_V1.filter((seed) =>
        seed.href.includes("gitlab.com"),
      ),
    ).toHaveLength(3);
    expect(new Set(AWESOME_AI_OSS_SEEDS_V1.map((seed) => seed.id)).size).toBe(
      15,
    );
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
    for (const seed of AWESOME_AI_OSS_SEEDS_V1) {
      expect(seed.addedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(seed.blurb.en.length).toBeGreaterThan(0);
    }
    for (const seed of AWESOME_AI_OSS_SEEDS) {
      expect(seed.addedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(seed.blurb.en.length).toBeGreaterThan(0);
      expect(seed.href).not.toMatch(/jlowin\/fastmcp/i);
      expect(`${seed.blurb.en}\n${seed.blurb.nl}`).not.toMatch(
        /\bstars?\b|★|sterren/i,
      );
    }
    expect(new Set(cards.map((card) => card.repoUrl)).size).toBe(165);
    expect(cards).toHaveLength(165);
    expect(
      cards.filter((card) => card.repoUrl.includes("github.com")),
    ).toHaveLength(162);
  });

  it("adds chunk 1 as 50 approved GitHub seeds without aliases or invented counts", () => {
    expect(CHUNK_1_EXPECTED).toHaveLength(50);
    expect(AWESOME_AI_OSS_SEEDS_CHUNK_1).toHaveLength(50);
    expect(AWESOME_AI_OSS_SEEDS).toHaveLength(165);
    expect(curatedPublicCards()).toHaveLength(165);

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

    expect(new Set(AWESOME_AI_OSS_SEEDS.map((seed) => seed.id)).size).toBe(165);
    expect(new Set(AWESOME_AI_OSS_SEEDS.map((seed) => seed.href)).size).toBe(
      165,
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

  it("adds chunk 2 as 50 live GitHub curated seeds without jlowin/fastmcp", () => {
    const cards = curatedPublicCards();
    const urls = cards.map((card) => card.repoUrl);
    expect(cards).toHaveLength(165);
    expect(
      cards.filter((card) => card.repoUrl.includes("github.com")),
    ).toHaveLength(162);
    for (const href of CHUNK2_REPO_URLS) {
      expect(urls).toContain(href);
    }
    expect(
      urls.some((href) => href.toLowerCase().includes("jlowin/fastmcp")),
    ).toBe(false);
    expect(new Set(urls.map((href) => href.toLowerCase())).size).toBe(165);
    expect(cards.filter((card) => card.category === "rag")).toHaveLength(18);
    expect(
      cards.find(
        (card) =>
          card.repoUrl ===
          "https://github.com/mcpdotdirect/template-mcp-server",
      )?.category,
    ).toBe("protocols");
    for (const seed of AWESOME_AI_OSS_SEEDS) {
      expect(seed.blurb.en.length).toBeLessThanOrEqual(
        AWESOME_AI_OSS_BLURB_MAX,
      );
      expect(seed.blurb.nl.length).toBeLessThanOrEqual(
        AWESOME_AI_OSS_BLURB_MAX,
      );
      expect(seed.blurb.en).not.toMatch(/\bstars?\b/i);
      expect(seed.blurb.nl).not.toMatch(/sterren/i);
    }

    const migration = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../migrations/20260914a_awesome_ai_oss_seeds_chunk_2.ts",
      ),
      "utf8",
    );
    expect(migration).toContain('ON CONFLICT ("repo_url") DO NOTHING');
    expect(migration).not.toMatch(/jlowin\/fastmcp/i);
    for (const href of CHUNK2_REPO_URLS) {
      expect(migration).toContain(href);
    }
  });

  it("lists chunk 3 as live GitHub curated cards in the extended categories", () => {
    expect(AWESOME_AI_OSS_SEEDS_CHUNK_3).toHaveLength(50);
    expect(
      new Set(AWESOME_AI_OSS_SEEDS_CHUNK_3.map((seed) => seed.href)),
    ).toEqual(new Set(CHUNK3_HREFS));
    expect(
      AWESOME_CATEGORY_IDS.some((id) =>
        ["rag", "agent-uis", "agent-tools", "eval-observability"].includes(id),
      ),
    ).toBe(true);
    expect(AWESOME_CATEGORY_LABELS.rag?.en).toBe("RAG & memory");
    expect(AWESOME_CATEGORY_LABELS["agent-uis"]?.en).toBe("Agent UIs & chat");
    expect(AWESOME_CATEGORY_LABELS["agent-tools"]?.en).toBe(
      "Agent tools & crawlers",
    );
    expect(AWESOME_CATEGORY_LABELS["eval-observability"]?.en).toBe(
      "Eval & observability",
    );
    expect(AWESOME_CATEGORY_LABELS.frameworks.en).toBe("Agent frameworks");

    const byCategory = AWESOME_AI_OSS_SEEDS_CHUNK_3.reduce<
      Record<string, number>
    >((counts, seed) => {
      counts[seed.category] = (counts[seed.category] ?? 0) + 1;
      return counts;
    }, {});
    expect(byCategory.rag).toBe(7);
    expect(byCategory["agent-uis"]).toBe(6);
    expect(byCategory["agent-tools"]).toBe(8);
    expect(byCategory["eval-observability"]).toBe(11);
    expect(byCategory.frameworks).toBe(18);

    for (const seed of AWESOME_AI_OSS_SEEDS_CHUNK_3) {
      expect(seed.href.startsWith("https://github.com/")).toBe(true);
      expect(seed.blurb.en.length).toBeLessThanOrEqual(160);
      expect(seed.blurb.nl.length).toBeLessThanOrEqual(160);
    }
    expect(
      curatedPublicCards()
        .filter((card) =>
          CHUNK3_HREFS.includes(card.repoUrl as (typeof CHUNK3_HREFS)[number]),
        )
        .every((card) => card.source === "curated"),
    ).toBe(true);
  });

  it("keeps the additive chunk-3 migration in lockstep with the seed list", () => {
    const migration = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../migrations/20260914c_awesome_ai_oss_seeds_chunk_3.ts",
      ),
      "utf8",
    );
    expect(migration).toContain("ON CONFLICT");
    expect(migration).toContain("'approved'");
    expect(migration).toContain("'curated'");
    expect(migration).not.toMatch(/jlowin\/fastmcp/i);
    expect(migration).not.toMatch(/\bstars?\b|★/);
    for (const seed of AWESOME_AI_OSS_SEEDS_CHUNK_3) {
      expect(migration).toContain(seed.id);
      expect(migration).toContain(seed.href);
      expect(migration).toContain(seed.addedOn);
    }
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
