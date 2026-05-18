import { describe, expect, it } from "vitest";

import {
  callChatGptGrounded,
  normalizeChatGptGroundedResponse,
} from "./chatgpt-grounded";
import { ProxyError } from "./types";

describe("normalizeChatGptGroundedResponse", () => {
  it("extracts answer text, citations, and provider metadata", () => {
    const result = normalizeChatGptGroundedResponse({
      id: "chatcmpl-abc123",
      model: "gpt-4o-search-preview-2025-03-11",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content:
              "For small teams, HubSpot and Pipedrive are popular choices.",
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  start_index: 14,
                  end_index: 21,
                  url: "https://www.g2.com/categories/crm",
                  title: "Best CRM Software 2025",
                },
              },
              {
                type: "url_citation",
                url_citation: {
                  start_index: 26,
                  end_index: 34,
                  url: "https://www.pipedrive.com/pricing",
                  title: "Pipedrive Pricing",
                },
              },
            ],
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 42,
        completion_tokens: 18,
        total_tokens: 60,
      },
    });

    expect(result.rawAnswer).toBe(
      "For small teams, HubSpot and Pipedrive are popular choices.",
    );
    expect(result.providerResponseId).toBe("chatcmpl-abc123");
    expect(result.providerModelId).toBe("gpt-4o-search-preview-2025-03-11");
    expect(result.providerModelVersion).toBe("2025-03-11");
    expect(result.promptTokens).toBe(42);
    expect(result.completionTokens).toBe(18);
    expect(result.sources).toHaveLength(2);
    const [first, second] = result.sources;
    expect(first).toEqual({
      url: "https://www.g2.com/categories/crm",
      domain: "g2.com",
      title: "Best CRM Software 2025",
      snippet: null,
      position: 0,
      kind: "citation",
      sourceType: "unknown",
      brandRelation: "unknown",
      explicitCitation: true,
    });
    expect(second?.domain).toBe("pipedrive.com");
    expect(second?.position).toBe(1);
  });

  it("handles a response with no annotations", () => {
    const result = normalizeChatGptGroundedResponse({
      id: "chatcmpl-xyz",
      model: "gpt-4o-search-preview",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "I don't have specific recommendations.",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 8,
        total_tokens: 18,
      },
    });

    expect(result.rawAnswer).toBe("I don't have specific recommendations.");
    expect(result.providerModelVersion).toBeNull();
    expect(result.sources).toEqual([]);
  });

  it("strips www. when extracting domain", () => {
    const result = normalizeChatGptGroundedResponse({
      id: "chatcmpl-1",
      model: "gpt-4o-search-preview",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Answer.",
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  start_index: 0,
                  end_index: 7,
                  url: "https://www.example.com/path?query=1",
                  title: "Example",
                },
              },
            ],
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    });

    expect(result.sources[0]?.domain).toBe("example.com");
  });

  it("skips annotations with malformed URLs but keeps the rest", () => {
    const result = normalizeChatGptGroundedResponse({
      id: "chatcmpl-2",
      model: "gpt-4o-search-preview",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Answer.",
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  start_index: 0,
                  end_index: 7,
                  url: "not a url",
                  title: "Bad",
                },
              },
              {
                type: "url_citation",
                url_citation: {
                  start_index: 0,
                  end_index: 7,
                  url: "https://good.example/x",
                  title: "Good",
                },
              },
            ],
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.domain).toBe("good.example");
  });

  it("ignores non-url_citation annotation types", () => {
    const result = normalizeChatGptGroundedResponse({
      id: "chatcmpl-3",
      model: "gpt-4o-search-preview",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Answer.",
            annotations: [
              { type: "file_citation", file_citation: { file_id: "f1" } },
              {
                type: "url_citation",
                url_citation: {
                  start_index: 0,
                  end_index: 7,
                  url: "https://example.com",
                  title: "Ex",
                },
              },
            ],
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    });

    expect(result.sources).toHaveLength(1);
  });

  it("throws ProxyError when there is no assistant message", () => {
    expect(() =>
      normalizeChatGptGroundedResponse({
        id: "chatcmpl-empty",
        model: "gpt-4o-search-preview",
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
      }),
    ).toThrow(ProxyError);
  });
});

describe("callChatGptGrounded", () => {
  it("posts the prompt to the OpenAI API and normalises the response", async () => {
    const fakeFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      expect(String(input)).toBe("https://api.openai.com/v1/chat/completions");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.model).toBe("gpt-4o-search-preview");
      expect(body.messages[0]?.content).toBe("best CRM for small teams");
      return new Response(
        JSON.stringify({
          id: "chatcmpl-test",
          model: "gpt-4o-search-preview-2025-03-11",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "HubSpot is popular.",
                annotations: [],
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await callChatGptGrounded(
      { prompt: "best CRM for small teams", locale: "en-US" },
      { apiKey: "sk-test", fetchImpl: fakeFetch },
    );

    expect(result.rawAnswer).toBe("HubSpot is popular.");
    expect(result.providerResponseId).toBe("chatcmpl-test");
  });

  it("throws ProxyError on non-200 responses", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        status: 429,
      });

    await expect(
      callChatGptGrounded(
        { prompt: "x", locale: "en-US" },
        { apiKey: "sk-test", fetchImpl: fakeFetch },
      ),
    ).rejects.toBeInstanceOf(ProxyError);
  });

  it("throws ProxyError when apiKey is missing", async () => {
    await expect(
      callChatGptGrounded(
        { prompt: "x", locale: "en-US" },
        { apiKey: "", fetchImpl: async () => new Response() },
      ),
    ).rejects.toBeInstanceOf(ProxyError);
  });
});
