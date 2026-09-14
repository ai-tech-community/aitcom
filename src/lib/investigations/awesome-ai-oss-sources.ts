export const AWESOME_SOURCE_KINDS = [
  "docs",
  "deep-dive",
  "talk",
  "demo",
] as const;

export type AwesomeSourceKind = (typeof AWESOME_SOURCE_KINDS)[number];

export type AwesomeSource = {
  kind: AwesomeSourceKind;
  href: string;
};

export const AWESOME_SOURCE_LABELS: Record<AwesomeSourceKind, string> = {
  docs: "Docs",
  "deep-dive": "Deep dive",
  talk: "Talk",
  demo: "Demo",
};

export const AWESOME_LEARN_MORE = "Learn more";

const KIND_SET = new Set<string>(AWESOME_SOURCE_KINDS);

/**
 * Official docs / product pages verified with a live HTTP 200 on 2026-09-14.
 * Empty on purpose when a second real URL could not be confirmed.
 */
export const AWESOME_AI_OSS_CURATED_SOURCES: Record<string, AwesomeSource[]> = {
  "curated-mcp-servers": [
    { kind: "docs", href: "https://modelcontextprotocol.io" },
    {
      kind: "deep-dive",
      href: "https://modelcontextprotocol.io/specification/2025-06-18",
    },
  ],
  "curated-mcp-specification": [
    { kind: "docs", href: "https://modelcontextprotocol.io" },
    {
      kind: "deep-dive",
      href: "https://modelcontextprotocol.io/docs/getting-started/intro",
    },
  ],
  "curated-mcp-python-sdk": [
    { kind: "docs", href: "https://modelcontextprotocol.io" },
    {
      kind: "deep-dive",
      href: "https://modelcontextprotocol.io/docs/getting-started/intro",
    },
  ],
  "curated-mcp-typescript-sdk": [
    { kind: "docs", href: "https://modelcontextprotocol.io" },
    {
      kind: "deep-dive",
      href: "https://modelcontextprotocol.io/docs/getting-started/intro",
    },
  ],
  "curated-fastmcp": [
    { kind: "docs", href: "https://gofastmcp.com" },
    {
      kind: "deep-dive",
      href: "https://gofastmcp.com/tutorials/create-mcp-server",
    },
  ],
  "curated-openai-agents": [
    { kind: "docs", href: "https://openai.github.io/openai-agents-python/" },
    {
      kind: "deep-dive",
      href: "https://openai.github.io/openai-agents-python/quickstart/",
    },
  ],
  "curated-langgraph": [
    { kind: "docs", href: "https://langchain-ai.github.io/langgraph/" },
    {
      kind: "deep-dive",
      href: "https://docs.langchain.com/oss/python/langgraph/overview",
    },
  ],
  "curated-transformers": [
    { kind: "docs", href: "https://huggingface.co/docs/transformers" },
    {
      kind: "deep-dive",
      href: "https://huggingface.co/docs/transformers/quicktour",
    },
  ],
  "curated-vllm": [
    { kind: "docs", href: "https://docs.vllm.ai" },
    {
      kind: "deep-dive",
      href: "https://docs.vllm.ai/en/latest/getting_started/quickstart.html",
    },
  ],
  "curated-ollama": [
    { kind: "docs", href: "https://docs.ollama.com" },
    { kind: "demo", href: "https://ollama.com" },
  ],
  "curated-a2a": [
    { kind: "docs", href: "https://a2a-protocol.org" },
    { kind: "deep-dive", href: "https://a2a-protocol.org/latest/" },
  ],
  "curated-gitlab-ai-assist": [
    { kind: "docs", href: "https://docs.gitlab.com/user/gitlab_duo/" },
    { kind: "deep-dive", href: "https://docs.gitlab.com" },
  ],
  "curated-gitlab": [
    { kind: "docs", href: "https://docs.gitlab.com" },
    { kind: "deep-dive", href: "https://docs.gitlab.com/ci/" },
  ],
  "curated-pydantic-ai": [
    { kind: "docs", href: "https://ai.pydantic.dev" },
    { kind: "deep-dive", href: "https://pydantic.dev/docs/ai/overview/" },
  ],
  "curated-agno": [
    { kind: "docs", href: "https://docs.agno.com" },
    { kind: "deep-dive", href: "https://docs.agno.com/introduction" },
  ],
  "curated-dspy": [
    { kind: "docs", href: "https://dspy.ai" },
    { kind: "deep-dive", href: "https://dspy.ai/learn/" },
  ],
  "curated-instructor": [
    { kind: "docs", href: "https://python.useinstructor.com" },
    {
      kind: "deep-dive",
      href: "https://python.useinstructor.com/getting-started/",
    },
  ],
  "curated-haystack": [
    { kind: "docs", href: "https://docs.haystack.deepset.ai" },
    { kind: "deep-dive", href: "https://haystack.deepset.ai/tutorials" },
  ],
  "curated-mem0": [
    { kind: "docs", href: "https://docs.mem0.ai" },
    { kind: "deep-dive", href: "https://docs.mem0.ai/platform/quickstart" },
  ],
  "curated-letta": [
    { kind: "docs", href: "https://docs.letta.com" },
    { kind: "deep-dive", href: "https://docs.letta.com/quickstart" },
  ],
  "curated-qdrant": [
    { kind: "docs", href: "https://qdrant.tech/documentation/" },
    {
      kind: "deep-dive",
      href: "https://qdrant.tech/documentation/quickstart/",
    },
  ],
  "curated-weaviate": [
    { kind: "docs", href: "https://docs.weaviate.io" },
    { kind: "deep-dive", href: "https://docs.weaviate.io/weaviate/quickstart" },
  ],
  "curated-chroma": [
    { kind: "docs", href: "https://docs.trychroma.com" },
    {
      kind: "deep-dive",
      href: "https://docs.trychroma.com/docs/overview/getting-started",
    },
  ],
  "curated-lancedb": [
    { kind: "docs", href: "https://docs.lancedb.com" },
    { kind: "deep-dive", href: "https://docs.lancedb.com/quickstart" },
  ],
  "curated-llamaindex": [
    { kind: "docs", href: "https://developers.llamaindex.ai" },
    {
      kind: "deep-dive",
      href: "https://developers.llamaindex.ai/python/framework/getting_started/starter_example/",
    },
  ],
  "curated-langchain": [
    {
      kind: "docs",
      href: "https://docs.langchain.com/oss/python/langchain/overview",
    },
    {
      kind: "deep-dive",
      href: "https://python.langchain.com/docs/introduction/",
    },
  ],
  "curated-librechat": [
    { kind: "docs", href: "https://www.librechat.ai/docs" },
    {
      kind: "deep-dive",
      href: "https://www.librechat.ai/docs/quick_start/local_setup",
    },
  ],
  "curated-dify": [
    { kind: "docs", href: "https://docs.dify.ai" },
    { kind: "deep-dive", href: "https://docs.dify.ai/en/home" },
  ],
  "curated-open-webui": [
    { kind: "docs", href: "https://docs.openwebui.com" },
    { kind: "deep-dive", href: "https://docs.openwebui.com/getting-started/" },
  ],
  "curated-flowise": [
    { kind: "docs", href: "https://docs.flowiseai.com" },
    { kind: "deep-dive", href: "https://docs.flowiseai.com/getting-started" },
  ],
  "curated-chainlit": [
    { kind: "docs", href: "https://docs.chainlit.io" },
    {
      kind: "deep-dive",
      href: "https://docs.chainlit.io/get-started/installation",
    },
  ],
  "curated-crawlee": [
    { kind: "docs", href: "https://crawlee.dev" },
    { kind: "deep-dive", href: "https://crawlee.dev/docs/quick-start" },
  ],
  "curated-e2b": [
    { kind: "docs", href: "https://e2b.dev/docs" },
    { kind: "deep-dive", href: "https://docs.e2b.dev/quickstart" },
  ],
  "curated-composio": [
    { kind: "docs", href: "https://docs.composio.dev" },
    { kind: "deep-dive", href: "https://docs.composio.dev/docs/quickstart" },
  ],
  "curated-langfuse": [
    { kind: "docs", href: "https://langfuse.com/docs" },
    { kind: "deep-dive", href: "https://langfuse.com/docs/get-started" },
  ],
  "curated-promptfoo": [
    { kind: "docs", href: "https://promptfoo.dev/docs" },
    {
      kind: "deep-dive",
      href: "https://www.promptfoo.dev/docs/getting-started/",
    },
  ],
  "curated-ragas": [
    { kind: "docs", href: "https://docs.ragas.io" },
    { kind: "deep-dive", href: "https://docs.ragas.io/en/stable/getstarted/" },
  ],
  "curated-deepeval": [
    { kind: "docs", href: "https://docs.confident-ai.com" },
    { kind: "deep-dive", href: "https://deepeval.com/docs/getting-started" },
  ],
  "curated-litellm": [
    { kind: "docs", href: "https://docs.litellm.ai" },
    { kind: "deep-dive", href: "https://docs.litellm.ai/docs/simple_proxy" },
  ],
  "curated-firecrawl": [
    { kind: "docs", href: "https://docs.firecrawl.dev" },
    { kind: "deep-dive", href: "https://docs.firecrawl.dev/quickstart" },
  ],
  "curated-browser-use": [
    { kind: "docs", href: "https://browser-use.com/docs" },
    { kind: "deep-dive", href: "https://docs.browser-use.com/quickstart" },
  ],
  "curated-n8n": [
    { kind: "docs", href: "https://docs.n8n.io" },
    { kind: "deep-dive", href: "https://docs.n8n.io/try-it-out/" },
  ],
  "curated-crewai": [
    { kind: "docs", href: "https://docs.crewai.com" },
    { kind: "deep-dive", href: "https://docs.crewai.com/quickstart" },
  ],
  "curated-semantic-kernel": [
    {
      kind: "docs",
      href: "https://learn.microsoft.com/en-us/semantic-kernel/",
    },
    {
      kind: "deep-dive",
      href: "https://learn.microsoft.com/en-us/semantic-kernel/get-started/quick-start-guide",
    },
  ],
  "curated-vercel-ai-sdk": [
    { kind: "docs", href: "https://sdk.vercel.ai/docs" },
    { kind: "deep-dive", href: "https://ai-sdk.dev/docs/getting-started" },
  ],
  "curated-tgi": [
    {
      kind: "docs",
      href: "https://huggingface.co/docs/text-generation-inference",
    },
    {
      kind: "deep-dive",
      href: "https://huggingface.co/docs/text-generation-inference/quicktour",
    },
  ],
  "curated-sglang": [
    { kind: "docs", href: "https://docs.sglang.ai" },
    {
      kind: "deep-dive",
      href: "https://docs.sglang.ai/get_started/install.html",
    },
  ],
  "curated-peft": [
    { kind: "docs", href: "https://huggingface.co/docs/peft" },
    { kind: "deep-dive", href: "https://huggingface.co/docs/peft/quicktour" },
  ],
  "curated-trl": [
    { kind: "docs", href: "https://huggingface.co/docs/trl" },
    { kind: "deep-dive", href: "https://huggingface.co/docs/trl/quickstart" },
  ],
  "curated-accelerate": [
    { kind: "docs", href: "https://huggingface.co/docs/accelerate" },
    {
      kind: "deep-dive",
      href: "https://huggingface.co/docs/accelerate/quicktour",
    },
  ],
  "curated-diffusers": [
    { kind: "docs", href: "https://huggingface.co/docs/diffusers" },
    {
      kind: "deep-dive",
      href: "https://huggingface.co/docs/diffusers/quicktour",
    },
  ],
  "curated-deepspeed": [
    { kind: "docs", href: "https://www.deepspeed.ai" },
    { kind: "deep-dive", href: "https://www.deepspeed.ai/getting-started/" },
  ],
  "curated-jax": [
    { kind: "docs", href: "https://jax.readthedocs.io" },
    {
      kind: "deep-dive",
      href: "https://docs.jax.dev/en/latest/quickstart.html",
    },
  ],
  "curated-onnxruntime": [
    { kind: "docs", href: "https://onnxruntime.ai/docs" },
    { kind: "deep-dive", href: "https://onnxruntime.ai/docs/get-started/" },
  ],
  "curated-comfyui": [
    { kind: "docs", href: "https://docs.comfy.org" },
    {
      kind: "deep-dive",
      href: "https://docs.comfy.org/get_started/gettingstarted",
    },
  ],
  "curated-mlc-llm": [
    { kind: "docs", href: "https://mlc.ai/mlc-llm/docs/" },
    { kind: "demo", href: "https://mlc.ai/mlc-llm/" },
  ],
  "curated-unsloth": [
    { kind: "docs", href: "https://docs.unsloth.ai" },
    {
      kind: "deep-dive",
      href: "https://docs.unsloth.ai/get-started/fine-tuning-guide",
    },
  ],
  "curated-axolotl": [
    { kind: "docs", href: "https://axolotl-ai-cloud.github.io/axolotl/" },
    {
      kind: "deep-dive",
      href: "https://axolotl-ai-cloud.github.io/axolotl/docs/getting-started.html",
    },
  ],
};

export function sanitizeAwesomeSources(
  sources: readonly { kind?: string; href?: string }[] | null | undefined,
): AwesomeSource[] {
  if (!sources?.length) return [];
  const clean: AwesomeSource[] = [];
  for (const source of sources) {
    if (!source.kind || !KIND_SET.has(source.kind)) continue;
    const href = absoluteHttpUrl(source.href);
    if (!href) continue;
    clean.push({ kind: source.kind as AwesomeSourceKind, href });
    if (clean.length === 4) break;
  }
  return clean;
}

/** Card/SEO display: hide the section unless 2–4 verified links remain. */
export function displayAwesomeSources(
  sources: readonly { kind?: string; href?: string }[] | null | undefined,
): AwesomeSource[] {
  const clean = sanitizeAwesomeSources(sources);
  return clean.length >= 2 ? clean : [];
}

function absoluteHttpUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.toString().replace(/\/$/, raw.endsWith("/") ? "/" : "");
  } catch {
    return null;
  }
}
