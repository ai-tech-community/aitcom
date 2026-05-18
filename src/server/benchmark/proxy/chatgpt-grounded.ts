import type { NormalizedSource, ProxyRunInput, ProxyRunResult } from "./types";
import { ProxyError } from "./types";

const SURFACE = "chatgpt_grounded" as const;
const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const REQUEST_MODEL = "gpt-4o-search-preview";

interface RawUrlCitation {
  type: "url_citation";
  url_citation: {
    start_index?: number;
    end_index?: number;
    url: string;
    title?: string;
  };
}

interface RawAnnotation {
  type: string;
  url_citation?: RawUrlCitation["url_citation"];
  [key: string]: unknown;
}

interface RawMessage {
  role: string;
  content?: string;
  annotations?: RawAnnotation[];
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

export interface ChatGptGroundedRawResponse {
  id: string;
  model: string;
  choices: RawChoice[];
  usage?: RawUsage;
}

export function normalizeChatGptGroundedResponse(
  raw: ChatGptGroundedRawResponse,
): ProxyRunResult {
  const message = raw.choices[0]?.message;
  if (!message || typeof message.content !== "string") {
    throw new ProxyError(
      "OpenAI response had no assistant message",
      SURFACE,
      raw,
    );
  }

  const sources: NormalizedSource[] = [];
  let position = 0;
  for (const annotation of message.annotations ?? []) {
    if (annotation.type !== "url_citation" || !annotation.url_citation) {
      continue;
    }
    const { url, title } = annotation.url_citation;
    const domain = safeDomain(url);
    if (!domain) continue;
    sources.push({
      url,
      domain,
      title: title ?? null,
      snippet: null,
      position,
      kind: "citation",
      sourceType: "unknown",
      brandRelation: "unknown",
      explicitCitation: true,
    });
    position += 1;
  }

  return {
    rawAnswer: message.content,
    sources,
    providerResponseId: raw.id,
    providerModelId: raw.model,
    providerModelVersion: extractVersionSuffix(raw.model),
    promptTokens: raw.usage?.prompt_tokens ?? null,
    completionTokens: raw.usage?.completion_tokens ?? null,
    costCents: null,
    providerResponseRaw: raw,
  };
}

export interface CallChatGptGroundedDeps {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export async function callChatGptGrounded(
  input: ProxyRunInput,
  deps: CallChatGptGroundedDeps,
): Promise<ProxyRunResult> {
  if (!deps.apiKey) {
    throw new ProxyError("OPENAI_API_KEY is required", SURFACE);
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
      `OpenAI returned ${response.status}: ${body.slice(0, 500)}`,
      SURFACE,
    );
  }

  const raw = (await response.json()) as ChatGptGroundedRawResponse;
  return normalizeChatGptGroundedResponse(raw);
}

function safeDomain(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function extractVersionSuffix(modelId: string): string | null {
  const match = /-(\d{4}-\d{2}-\d{2})$/.exec(modelId);
  return match ? (match[1] ?? null) : null;
}
