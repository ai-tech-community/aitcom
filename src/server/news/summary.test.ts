import { afterEach, describe, expect, it, vi } from "vitest";

import { clampNewsSummary, generateNewsSummary } from "./summary";

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
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const text = await generateNewsSummary({
      title: "New models",
      summary: "What shipped this week.",
    });
    expect(text).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("asks the model once when a key is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "A model wrote this." }],
      }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const text = await generateNewsSummary({
      title: "New models",
      summary: "What shipped this week.",
    });
    expect(text).toBe("A model wrote this.");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.stringify(fetchSpy.mock.calls);
    expect(body).toContain("technology or business news item");
    expect(body).not.toContain("AI news item");
  });
});
