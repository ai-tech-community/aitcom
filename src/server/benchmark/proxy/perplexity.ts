import { estimateCostCents } from "./pricing";
import type { NormalizedSource, ProxyRunInput, ProxyRunResult } from "./types";
import { ProxyError } from "./types";

const SURFACE = "perplexity" as const;
const ENDPOINT = "https://api.perplexity.ai/chat/completions";
const REQUEST_MODEL = "sonar";

interface RawMessage {
  role: string;
  content?: string;
}

interface RawChoice {
  index: number;
  message?: RawMessage;
  finish_reason?: string;
}

interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface RawSearchResult {
  url?: string;
  title?: string;
  snippet?: string;
}

export interface PerplexityRawResponse {
  id: string;
  model: string;
  choices: RawChoice[];
  usage?: RawUsage;
  // Newer Perplexity responses expose richer source metadata via
  // `search_results`. The older `citations` field carries just URLs as
  // strings. The normaliser prefers search_results when present and
  // falls back to citations otherwise.
  citations?: string[];
  search_results?: RawSearchResult[];
}

export function normalizePerplexityResponse(
  raw: PerplexityRawResponse,
): ProxyRunResult {
  const message = raw.choices[0]?.message;
  if (!message || typeof message.content !== "string") {
    throw new ProxyError(
      "Perplexity response had no assistant message",
      SURFACE,
      raw,
    );
  }

  const sources: NormalizedSource[] = [];
  let position = 0;

  if (Array.isArray(raw.search_results) && raw.search_results.length > 0) {
    for (const result of raw.search_results) {
      if (typeof result.url !== "string") continue;
      const domain = safeDomain(result.url);
      if (!domain) continue;
      sources.push({
        url: result.url,
        domain,
        title: result.title ?? null,
        snippet: result.snippet ?? null,
        position,
        kind: "citation",
        sourceType: "unknown",
        brandRelation: "unknown",
        explicitCitation: true,
      });
      position += 1;
    }
  } else {
    for (const url of raw.citations ?? []) {
      if (typeof url !== "string") continue;
      const domain = safeDomain(url);
      if (!domain) continue;
      sources.push({
        url,
        domain,
        title: null,
        snippet: null,
        position,
        kind: "citation",
        sourceType: "unknown",
        brandRelation: "unknown",
        explicitCitation: true,
      });
      position += 1;
    }
  }

  const promptTokens = raw.usage?.prompt_tokens ?? null;
  const completionTokens = raw.usage?.completion_tokens ?? null;
  return {
    rawAnswer: message.content,
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

export interface CallPerplexityDeps {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export async function callPerplexity(
  input: ProxyRunInput,
  deps: CallPerplexityDeps,
): Promise<ProxyRunResult> {
  if (!deps.apiKey) {
    throw new ProxyError("PERPLEXITY_API_KEY is required", SURFACE);
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${deps.apiKey}`,
    },
    body: JSON.stringify({
      model: REQUEST_MODEL,
      messages: [{ role: "user", content: input.prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ProxyError(
      `Perplexity returned ${response.status}: ${body.slice(0, 500)}`,
      SURFACE,
    );
  }

  const raw = (await response.json()) as PerplexityRawResponse;
  return normalizePerplexityResponse(raw);
}

function safeDomain(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
