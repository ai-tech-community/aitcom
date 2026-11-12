import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QWEN3_8B_MODEL } from "@/lib/inference-model";

import {
  completeChat,
  completeJson,
  DEFAULT_INFERENCE_BASE_URL,
  parseJsonContent,
  stripThinking,
} from "./openai-compatible";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function requestJson(init: RequestInit): unknown {
  if (typeof init.body !== "string") {
    throw new Error("expected a JSON string body");
  }
  return JSON.parse(init.body);
}

function jsonResponse(content: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
    text: async () => "",
  };
}

describe("stripThinking", () => {
  it("drops a leading Qwen think block and leaves the answer", () => {
    expect(stripThinking('<think>draft the json</think>\n{"ok":true}')).toBe(
      '{"ok":true}',
    );
  });

  it("drops an empty think block Qwen emits in non-thinking mode", () => {
    expect(stripThinking("<think>\n\n</think>\nHello there.")).toBe(
      "Hello there.",
    );
  });

  it("treats an unclosed leading think block as no answer", () => {
    expect(stripThinking("<think>still thinking")).toBe("");
  });

  it("leaves a think tag that appears after the answer starts", () => {
    expect(stripThinking('{"note":"see <think> tag"}')).toBe(
      '{"note":"see <think> tag"}',
    );
  });
});

describe("parseJsonContent", () => {
  it("reads JSON wrapped in a markdown fence", () => {
    expect(parseJsonContent('```json\n{"mentions":[]}\n```')).toEqual({
      mentions: [],
    });
  });

  it("reads a JSON object that follows a short preamble", () => {
    expect(parseJsonContent('Here you go: {"mentions":[]}')).toEqual({
      mentions: [],
    });
  });
});

describe("completeChat", () => {
  it("calls the OpenRouter chat completions endpoint with Qwen3-8B and reasoning off", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("EXTRACTOR_MODEL", "");
    vi.stubEnv("OPENROUTER_BASE_URL", "");
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse("A plain answer."),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const text = await completeChat({
      title: "AIT News Summary",
      messages: [{ role: "user", content: "Summarize." }],
    });

    expect(text).toBe("A plain answer.");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${DEFAULT_INFERENCE_BASE_URL}/chat/completions`);
    expect(url).not.toContain("api.anthropic.com");
    const body = requestJson(init) as {
      model: string;
      response_format?: unknown;
      reasoning: { enabled: boolean };
    };
    expect(body.model).toBe(QWEN3_8B_MODEL);
    expect(body.response_format).toBeUndefined();
    expect(body.reasoning).toEqual({ enabled: false });
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key",
    );
  });

  it("honours EXTRACTOR_MODEL and OPENROUTER_BASE_URL", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("EXTRACTOR_MODEL", "qwen/qwen3-8b:free");
    vi.stubEnv("OPENROUTER_BASE_URL", "https://example.test/v1/");
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse("ok"),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await completeChat({
      messages: [{ role: "user", content: "Hi" }],
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://example.test/v1/chat/completions");
    const body = requestJson(init) as {
      model: string;
      reasoning?: unknown;
    };
    expect(body.model).toBe("qwen/qwen3-8b:free");
    expect(body.reasoning).toBeUndefined();
  });
});

describe("completeJson", () => {
  it("asks for a JSON object and parses a fenced reply without a second call", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse('```json\n{"mentions":[]}\n```'),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const parsed = await completeJson<{ mentions: unknown[] }>({
      messages: [{ role: "user", content: "Extract." }],
    });

    expect(parsed).toEqual({ mentions: [] });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = requestJson(fetchSpy.mock.calls[0]![1]) as {
      response_format: { type: string };
    };
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("retries once when the first reply is not JSON", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse("unused"),
    );
    fetchSpy
      .mockResolvedValueOnce(jsonResponse("<think>hmm</think>not json"))
      .mockResolvedValueOnce(
        jsonResponse('{"mentions":[{"rawMention":"Acme"}]}'),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const parsed = await completeJson<{
      mentions: Array<{ rawMention: string }>;
    }>({
      messages: [{ role: "user", content: "Extract." }],
    });

    expect(parsed.mentions).toEqual([{ rawMention: "Acme" }]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const retry = requestJson(fetchSpy.mock.calls[1]![1]) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(retry.messages.at(-1)?.content).toMatch(/valid JSON/);
  });

  it("does not call the model a third time", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse("still not json"),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      completeJson({ messages: [{ role: "user", content: "Extract." }] }),
    ).rejects.toThrow(/one retry/);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("owned inference stays off frontier APIs", () => {
  const files = [
    "src/server/news/summary.ts",
    "src/server/benchmark/extract-run.ts",
    "src/server/benchmark/suggest-prompts.ts",
    "src/server/benchmark/strategy.ts",
    "src/scripts/benchmark-extractor/run.ts",
    "src/scripts/dev-extract-run.ts",
    "src/lib/n8n-workflow-generator.ts",
  ];

  it("does not call Anthropic, Kimi, or gpt-4o", () => {
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(
        /api\.anthropic\.com|claude-haiku|kimi-k2|gpt-4o/,
      );
      expect(source).not.toContain("ANTHROPIC_API_KEY");
    }
    const pkg = readFileSync(join(process.cwd(), "package.json"), "utf8");
    expect(pkg).not.toContain("@anthropic-ai/sdk");
  });
});
