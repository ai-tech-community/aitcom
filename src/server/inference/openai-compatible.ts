import { QWEN3_8B_MODEL } from "@/lib/inference-model";

export const DEFAULT_INFERENCE_MODEL = QWEN3_8B_MODEL;
export const DEFAULT_INFERENCE_BASE_URL = "https://openrouter.ai/api/v1";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CompleteChatOptions = {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask for a JSON object. News summaries leave this off. */
  json?: boolean;
  /** Sent as OpenRouter's X-Title header. Ignored by other hosts. */
  title?: string;
};

type CompletionBody = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

function trimmedEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function isOpenRouterHost(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === "openrouter.ai" || host.endsWith(".openrouter.ai");
  } catch {
    return false;
  }
}

export function inferenceApiKey(): string {
  return trimmedEnv("OPENROUTER_API_KEY");
}

export function inferenceBaseUrl(): string {
  return (
    trimmedEnv("OPENROUTER_BASE_URL") || DEFAULT_INFERENCE_BASE_URL
  ).replace(/\/+$/, "");
}

export function extractorModel(): string {
  return trimmedEnv("EXTRACTOR_MODEL") || DEFAULT_INFERENCE_MODEL;
}

export function newsSummaryModel(): string {
  return trimmedEnv("NEWS_SUMMARY_MODEL") || DEFAULT_INFERENCE_MODEL;
}

/**
 * Drop a leading Qwen3 thinking trace. OpenRouter puts the answer in
 * `message.content` and the trace in `message.reasoning` when reasoning is
 * on; some providers still prefix content with `<think>…</think>`.
 * Tags after the first answer character are left alone.
 */
export function stripThinking(text: string): string {
  let rest = text.trim();
  const closed = /^<think>[\s\S]*?<\/think>/i;
  while (closed.test(rest)) {
    rest = rest.replace(closed, "").trim();
  }
  if (/^<think\b/i.test(rest)) return "";
  return rest;
}

function stripFence(text: string): string {
  const fence = /^```(?:json|text|markdown)?\s*([\s\S]*?)```$/i.exec(
    text.trim(),
  );
  return (fence?.[1] ?? text).trim();
}

export function parseJsonContent<T>(text: string): T | undefined {
  const cleaned = stripFence(stripThinking(text));
  const direct = tryParse<T>(cleaned);
  if (direct !== undefined) return direct;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return tryParse<T>(cleaned.slice(start, end + 1));
  }
  return undefined;
}

function tryParse<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

const JSON_RETRY_NUDGE =
  "Your previous reply was not valid JSON. Return ONLY one JSON object. No think tags, no markdown fences, no prose.";

export async function completeChat(
  options: CompleteChatOptions,
): Promise<string> {
  const apiKey = inferenceApiKey();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");

  const baseUrl = inferenceBaseUrl();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://aitcommunity.org",
      "X-Title": options.title ?? "AIT",
    },
    body: JSON.stringify({
      model: options.model ?? extractorModel(),
      messages: options.messages,
      temperature: options.temperature ?? 0,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
      // OpenRouter reasoning guide: `enabled: false` turns thinking off
      // (`effort: "none"` is the same switch). Qwen3-8B can answer in
      // non-thinking mode. Other hosts are not sent this field; leftover
      // `<think>` blocks are stripped from the reply either way.
      ...(isOpenRouterHost(baseUrl) ? { reasoning: { enabled: false } } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Inference ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as CompletionBody;
  const raw = body.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(`Empty inference response: ${JSON.stringify(body)}`);
  }
  return stripFence(stripThinking(raw));
}

export async function completeJson<T>(
  options: CompleteChatOptions,
): Promise<T> {
  const request = { ...options, json: true };
  const first = await completeChat(request);
  const parsed = parseJsonContent<T>(first);
  if (parsed !== undefined) return parsed;

  const second = await completeChat({
    ...request,
    messages: [
      ...options.messages,
      { role: "assistant", content: first },
      { role: "user", content: JSON_RETRY_NUDGE },
    ],
  });
  const retried = parseJsonContent<T>(second);
  if (retried !== undefined) return retried;
  throw new Error(
    `Inference returned non-JSON after one retry: ${second.slice(0, 300)}`,
  );
}
