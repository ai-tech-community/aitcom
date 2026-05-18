import { estimateCostCents } from "./pricing";
import type { NormalizedSource, ProxyRunInput, ProxyRunResult } from "./types";
import { ProxyError } from "./types";

const SURFACE = "claude_grounded" as const;
const ENDPOINT = "https://api.anthropic.com/v1/messages";
const REQUEST_MODEL = "claude-sonnet-4-5";
const WEB_SEARCH_TOOL_VERSION = "web_search_20250305";
const ANTHROPIC_VERSION = "2023-06-01";

interface RawCitation {
  type: string;
  url?: string;
  title?: string;
  cited_text?: string;
}

interface RawTextBlock {
  type: "text";
  text?: string;
  citations?: RawCitation[];
}

interface RawAnyBlock {
  type: string;
  text?: string;
  citations?: RawCitation[];
  [key: string]: unknown;
}

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  server_tool_use?: {
    web_search_requests?: number;
  };
}

export interface ClaudeGroundedRawResponse {
  id: string;
  model: string;
  content: RawAnyBlock[];
  usage?: RawUsage;
}

export function normalizeClaudeGroundedResponse(
  raw: ClaudeGroundedRawResponse,
): ProxyRunResult {
  const textParts: string[] = [];
  const sources: NormalizedSource[] = [];
  let position = 0;

  for (const block of raw.content ?? []) {
    if (block.type !== "text") continue;
    const text = (block as RawTextBlock).text;
    if (typeof text === "string") textParts.push(text);

    for (const citation of block.citations ?? []) {
      if (
        citation.type !== "web_search_result_location" ||
        typeof citation.url !== "string"
      ) {
        continue;
      }
      const domain = safeDomain(citation.url);
      if (!domain) continue;
      sources.push({
        url: citation.url,
        domain,
        title: citation.title ?? null,
        snippet: citation.cited_text ?? null,
        position,
        kind: "citation",
        sourceType: "unknown",
        brandRelation: "unknown",
        explicitCitation: true,
      });
      position += 1;
    }
  }

  if (textParts.length === 0) {
    throw new ProxyError(
      "Anthropic response had no text content blocks",
      SURFACE,
      raw,
    );
  }

  const promptTokens = raw.usage?.input_tokens ?? null;
  const completionTokens = raw.usage?.output_tokens ?? null;
  return {
    rawAnswer: textParts.join(""),
    sources,
    providerResponseId: raw.id,
    providerModelId: raw.model,
    providerModelVersion: null,
    promptTokens,
    completionTokens,
    costCents: estimateCostCents(SURFACE, promptTokens, completionTokens),
    providerResponseRaw: raw,
  };
}

export interface CallClaudeGroundedDeps {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export async function callClaudeGrounded(
  input: ProxyRunInput,
  deps: CallClaudeGroundedDeps,
): Promise<ProxyRunResult> {
  if (!deps.apiKey) {
    throw new ProxyError("ANTHROPIC_API_KEY is required", SURFACE);
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": deps.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: REQUEST_MODEL,
      max_tokens: 2048,
      tools: [{ type: WEB_SEARCH_TOOL_VERSION, name: "web_search" }],
      messages: [{ role: "user", content: input.prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ProxyError(
      `Anthropic returned ${response.status}: ${body.slice(0, 500)}`,
      SURFACE,
    );
  }

  const raw = (await response.json()) as ClaudeGroundedRawResponse;
  return normalizeClaudeGroundedResponse(raw);
}

function safeDomain(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
