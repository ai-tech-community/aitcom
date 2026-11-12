import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseSuggestionResponse,
  suggestPromptsForBrand,
} from "./suggest-prompts";

function requestJson(init: RequestInit): unknown {
  if (typeof init.body !== "string") {
    throw new Error("expected a JSON string body");
  }
  return JSON.parse(init.body);
}

const cats = new Set(["saas", "finance"]);
const intents = new Set(["recommendation", "comparison"]);

describe("parseSuggestionResponse", () => {
  it("parses a valid response", () => {
    const result = parseSuggestionResponse(
      JSON.stringify({
        suggestions: [
          {
            text: "What is the best CRM for startups?",
            categorySlug: "saas",
            intentSlug: "recommendation",
            tags: ["B2B", "crm"],
          },
        ],
      }),
      cats,
      intents,
    );
    expect(result).toEqual([
      {
        text: "What is the best CRM for startups?",
        categorySlug: "saas",
        intentSlug: "recommendation",
        tags: ["b2b", "crm"],
      },
    ]);
  });

  it("rejects suggestions with unknown category/intent slugs", () => {
    const result = parseSuggestionResponse(
      JSON.stringify({
        suggestions: [
          { text: "Test", categorySlug: "nope", intentSlug: "recommendation" },
          { text: "Test", categorySlug: "saas", intentSlug: "fake" },
        ],
      }),
      cats,
      intents,
    );
    expect(result).toEqual([]);
  });

  it("rejects prompts shorter than 4 chars", () => {
    const result = parseSuggestionResponse(
      JSON.stringify({
        suggestions: [
          { text: "hi", categorySlug: "saas", intentSlug: "recommendation" },
        ],
      }),
      cats,
      intents,
    );
    expect(result).toEqual([]);
  });

  it("clamps text to 500 chars and tags to 10 entries", () => {
    const long = "x".repeat(1000);
    const manyTags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    const result = parseSuggestionResponse(
      JSON.stringify({
        suggestions: [
          {
            text: long,
            categorySlug: "saas",
            intentSlug: "recommendation",
            tags: manyTags,
          },
        ],
      }),
      cats,
      intents,
    );
    expect(result[0]?.text.length).toBe(500);
    expect(result[0]?.tags.length).toBe(10);
  });

  it("returns [] on malformed JSON", () => {
    expect(parseSuggestionResponse("not json", cats, intents)).toEqual([]);
  });

  it("returns [] when suggestions field is missing", () => {
    expect(parseSuggestionResponse("{}", cats, intents)).toEqual([]);
  });
});

describe("suggestPromptsForBrand", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("retries a bad JSON reply once, then drops unknown catalog slugs", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const good = {
      suggestions: [
        {
          text: "What is the best CRM for startups?",
          categorySlug: "saas",
          intentSlug: "recommendation",
          tags: ["crm"],
        },
        {
          text: "What is the best bank for startups?",
          categorySlug: "not-a-category",
          intentSlug: "recommendation",
          tags: [],
        },
      ],
    };
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "" } }] }),
      text: async () => "",
    }));
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "<think>nope</think>not json" } }],
        }),
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(good) } }],
        }),
        text: async () => "",
      });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await suggestPromptsForBrand({
      brand: { canonicalName: "Acme", aliases: [] },
      categories: [
        { slug: "saas", name: "SaaS" },
        { slug: "finance", name: "Finance" },
      ],
      intents: [{ slug: "recommendation", name: "Recommendation" }],
      limit: 2,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      {
        text: "What is the best CRM for startups?",
        categorySlug: "saas",
        intentSlug: "recommendation",
        tags: ["crm"],
      },
    ]);
    const body = requestJson(fetchSpy.mock.calls[0]![1]) as {
      model: string;
    };
    expect(body.model).toBe("qwen/qwen3-8b");
  });
});
