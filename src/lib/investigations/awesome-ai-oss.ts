export const AWESOME_AI_OSS_PATH = "/investigations/awesome-ai-oss";

export const AWESOME_AI_OSS_H1 = "Awesome AI OSS for AIT builders";

export const AWESOME_AI_OSS_META =
  "A short curated map of open-source building blocks for human + agent pairs. Live GitHub and GitLab only. Not a registry and not a star-sorted dump.";

export const AWESOME_AI_OSS_JOIN_HREF = "https://www.aitcommunity.org/en/join";

export type AwesomeLocale = "en" | "nl";

export type AwesomeRepo = {
  href: string;
  name: string;
  blurb: Record<AwesomeLocale, string>;
};

export type AwesomeCategoryId =
  | "protocols"
  | "runtimes"
  | "frameworks"
  | "models"
  | "gitlab";

export type AwesomeCategory = {
  id: AwesomeCategoryId;
  headingKey: AwesomeCategoryId;
  repos: readonly AwesomeRepo[];
};

export const AWESOME_AI_OSS_CATEGORIES: readonly AwesomeCategory[] = [
  {
    id: "protocols",
    headingKey: "protocols",
    repos: [
      {
        name: "modelcontextprotocol/servers",
        href: "https://github.com/modelcontextprotocol/servers",
        blurb: {
          en: "Reference MCP servers",
          nl: "Referentie-MCP-servers",
        },
      },
      {
        name: "modelcontextprotocol/python-sdk",
        href: "https://github.com/modelcontextprotocol/python-sdk",
        blurb: {
          en: "Official Python SDK",
          nl: "Officiële Python-SDK",
        },
      },
      {
        name: "modelcontextprotocol/typescript-sdk",
        href: "https://github.com/modelcontextprotocol/typescript-sdk",
        blurb: {
          en: "Official TS SDK",
          nl: "Officiële TS-SDK",
        },
      },
    ],
  },
  {
    id: "runtimes",
    headingKey: "runtimes",
    repos: [
      {
        name: "PrefectHQ/fastmcp",
        href: "https://github.com/PrefectHQ/fastmcp",
        blurb: {
          en: "FastMCP server/client framework",
          nl: "FastMCP server/client-framework",
        },
      },
      {
        name: "lastmile-ai/mcp-agent",
        href: "https://github.com/lastmile-ai/mcp-agent",
        blurb: {
          en: "MCP-native agent patterns",
          nl: "MCP-native agentpatronen",
        },
      },
      {
        name: "gitlab-org/ai/lazy-mcp",
        href: "https://gitlab.com/gitlab-org/ai/lazy-mcp",
        blurb: {
          en: "GitLab Lazy MCP",
          nl: "GitLab Lazy MCP",
        },
      },
    ],
  },
  {
    id: "frameworks",
    headingKey: "frameworks",
    repos: [
      {
        name: "openai/openai-agents-python",
        href: "https://github.com/openai/openai-agents-python",
        blurb: {
          en: "OpenAI Agents SDK (+ MCP)",
          nl: "OpenAI Agents SDK (+ MCP)",
        },
      },
      {
        name: "microsoft/agent-framework",
        href: "https://github.com/microsoft/agent-framework",
        blurb: {
          en: "Multi-agent workflows",
          nl: "Multi-agent-workflows",
        },
      },
      {
        name: "langchain-ai/langgraph",
        href: "https://github.com/langchain-ai/langgraph",
        blurb: {
          en: "Stateful agent graphs",
          nl: "Stateful agent-graphs",
        },
      },
    ],
  },
  {
    id: "models",
    headingKey: "models",
    repos: [
      {
        name: "huggingface/transformers",
        href: "https://github.com/huggingface/transformers",
        blurb: {
          en: "Models & tooling",
          nl: "Modellen en tooling",
        },
      },
      {
        name: "vllm-project/vllm",
        href: "https://github.com/vllm-project/vllm",
        blurb: {
          en: "Open model serving",
          nl: "Open-model-serving",
        },
      },
      {
        name: "ollama/ollama",
        href: "https://github.com/ollama/ollama",
        blurb: {
          en: "Local model run",
          nl: "Lokaal model draaien",
        },
      },
      {
        name: "google/A2A",
        href: "https://github.com/google/A2A",
        blurb: {
          en: "Agent-to-agent protocol",
          nl: "Agent-to-agent-protocol",
        },
      },
    ],
  },
  {
    id: "gitlab",
    headingKey: "gitlab",
    repos: [
      {
        name: "gitlab-org/modelops/applied-ml/code-suggestions/ai-assist",
        href: "https://gitlab.com/gitlab-org/modelops/applied-ml/code-suggestions/ai-assist",
        blurb: {
          en: "GitLab AI Gateway for Duo / AI features",
          nl: "GitLab AI Gateway voor Duo / AI-features",
        },
      },
      {
        name: "gitlab-org/gitlab",
        href: "https://gitlab.com/gitlab-org/gitlab",
        blurb: {
          en: "GitLab application",
          nl: "GitLab-applicatie",
        },
      },
    ],
  },
] as const;

export const AWESOME_AI_OSS_REPOS: readonly AwesomeRepo[] =
  AWESOME_AI_OSS_CATEGORIES.flatMap((category) => category.repos);
