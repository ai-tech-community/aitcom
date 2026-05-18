import { describe, expect, it } from "vitest";

import {
  callPerplexity,
  normalizePerplexityResponse,
} from "./perplexity";
import { ProxyError } from "./types";

describe("normalizePerplexityResponse", () => {
  it("uses search_results when present (richer metadata)", () => {
    const result = normalizePerplexityResponse({
      id: "px-1",
      model: "sonar",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "HubSpot and Pipedrive." },
        },
      ],
      usage: { prompt_tokens: 30, completion_tokens: 15 },
      search_results: [
        {
          url: "https://g2.com/categories/crm",
          title: "Best CRM 2025",
          snippet: "HubSpot leads.",
        },
        {
          url: "https://pipedrive.com/pricing",
          title: "Pipedrive Pricing",
        },
      ],
      citations: ["https://ignored.example/old-citations"],
    });

    expect(result.rawAnswer).toBe("HubSpot and Pipedrive.");
    expect(result.providerResponseId).toBe("px-1");
    expect(result.providerModelId).toBe("sonar");
    expect(result.promptTokens).toBe(30);
    expect(result.completionTokens).toBe(15);
    expect(result.costCents).not.toBeNull();
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]).toMatchObject({
      domain: "g2.com",
      title: "Best CRM 2025",
      snippet: "HubSpot leads.",
      position: 0,
    });
    expect(result.sources[1]?.domain).toBe("pipedrive.com");
  });

  it("falls back to the citations URL list when search_results is absent", () => {
    const result = normalizePerplexityResponse({
      id: "px-2",
      model: "sonar",
      choices: [
        { index: 0, message: { role: "assistant", content: "Answer." } },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
      citations: [
        "https://example.com/a",
        "https://www.other.example/b",
      ],
    });
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]?.domain).toBe("example.com");
    expect(result.sources[1]?.domain).toBe("other.example");
    expect(result.sources[0]?.snippet).toBeNull();
  });

  it("returns no sources when neither field is present", () => {
    const result = normalizePerplexityResponse({
      id: "px-3",
      model: "sonar",
      choices: [
        { index: 0, message: { role: "assistant", content: "Bare answer." } },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    expect(result.sources).toEqual([]);
  });

  it("skips malformed URLs in both source-list shapes", () => {
    const result = normalizePerplexityResponse({
      id: "px-4",
      model: "sonar",
      choices: [
        { index: 0, message: { role: "assistant", content: "x" } },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      search_results: [
        { url: "not a url", title: "bad" },
        { url: "https://kept.example", title: "kept" },
      ],
    });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.domain).toBe("kept.example");
  });

  it("throws ProxyError when there is no assistant message", () => {
    expect(() =>
      normalizePerplexityResponse({
        id: "px-empty",
        model: "sonar",
        choices: [],
      }),
    ).toThrow(ProxyError);
  });
});

describe("callPerplexity", () => {
  it("posts to the Perplexity API and normalises the response", async () => {
    const fakeFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      expect(String(input)).toBe(
        "https://api.perplexity.ai/chat/completions",
      );
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.model).toBe("sonar");
      expect(body.messages[0]?.content).toBe("best CRM for small teams");
      return new Response(
        JSON.stringify({
          id: "px-live",
          model: "sonar",
          choices: [
            { index: 0, message: { role: "assistant", content: "Answer." } },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
          citations: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await callPerplexity(
      { prompt: "best CRM for small teams", locale: "en-US" },
      { apiKey: "pplx-test", fetchImpl: fakeFetch },
    );
    expect(result.rawAnswer).toBe("Answer.");
  });

  it("throws ProxyError on non-200 responses", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response("auth failed", { status: 401 });
    await expect(
      callPerplexity(
        { prompt: "x", locale: "en-US" },
        { apiKey: "pplx-test", fetchImpl: fakeFetch },
      ),
    ).rejects.toBeInstanceOf(ProxyError);
  });

  it("throws ProxyError when apiKey is missing", async () => {
    await expect(
      callPerplexity(
        { prompt: "x", locale: "en-US" },
        { apiKey: "", fetchImpl: async () => new Response() },
      ),
    ).rejects.toBeInstanceOf(ProxyError);
  });
});
