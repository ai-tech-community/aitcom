import { afterEach, describe, expect, it, vi } from "vitest";

import { clampNewsSummary, generateNewsSummary } from "./summary";

function requestJson(init: RequestInit): unknown {
  if (typeof init.body !== "string") {
    throw new Error("expected a JSON string body");
  }
  return JSON.parse(init.body);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("clampNewsSummary", () => {
  it("keeps a short excerpt and trims a long one", () => {
    expect(clampNewsSummary("  Hello   there  ")).toBe("Hello there");
    const long = "a".repeat(250);
    expect(clampNewsSummary(long)).toHaveLength(240);
    expect(clampNewsSummary(long).endsWith("…")).toBe(true);
  });
});

describe("generateNewsSummary", () => {
  it("leaves the summary empty when no model key is set", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "leftover-anthropic-key");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const text = await generateNewsSummary({
      title: "New models",
      summary: "What shipped this week.",
    });
    expect(text).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("asks Qwen3-8B once when a key is set and drops a think block", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("NEWS_SUMMARY_MODEL", "");
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "<think>draft</think>\nA model wrote this.",
            },
          },
        ],
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const text = await generateNewsSummary({
      title: "New models",
      summary: "What shipped this week.",
    });
    expect(text).toBe("A model wrote this.");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = requestJson(init) as {
      model: string;
      reasoning: { enabled: boolean };
    };
    expect(body.model).toBe("qwen/qwen3-8b");
    expect(body.reasoning).toEqual({ enabled: false });
    const serialized = JSON.stringify(fetchSpy.mock.calls);
    expect(serialized).toContain("technology or business news item");
    expect(serialized).not.toContain("AI news item");
    expect(serialized).not.toContain("api.anthropic.com");
  });
});
