import { describe, expect, it } from "vitest";

import {
  callClaudeGrounded,
  normalizeClaudeGroundedResponse,
} from "./claude-grounded";
import { ProxyError } from "./types";

describe("normalizeClaudeGroundedResponse", () => {
  it("concatenates text blocks and extracts web-search citations", () => {
    const result = normalizeClaudeGroundedResponse({
      id: "msg_test",
      model: "claude-sonnet-4-5",
      content: [
        {
          type: "text",
          text: "HubSpot ",
          citations: [
            {
              type: "web_search_result_location",
              url: "https://www.g2.com/categories/crm",
              title: "Best CRM 2025",
              cited_text: "HubSpot is rated highly",
            },
          ],
        },
        { type: "server_tool_use", id: "x", name: "web_search", input: {} },
        {
          type: "text",
          text: "and Pipedrive lead the small-team CRM space.",
          citations: [
            {
              type: "web_search_result_location",
              url: "https://pipedrive.com/pricing",
              title: "Pipedrive Pricing",
            },
          ],
        },
      ],
      usage: {
        input_tokens: 40,
        output_tokens: 25,
        server_tool_use: { web_search_requests: 1 },
      },
    });

    expect(result.rawAnswer).toBe(
      "HubSpot and Pipedrive lead the small-team CRM space.",
    );
    expect(result.providerResponseId).toBe("msg_test");
    expect(result.providerModelId).toBe("claude-sonnet-4-5");
    expect(result.promptTokens).toBe(40);
    expect(result.completionTokens).toBe(25);
    expect(result.costCents).not.toBeNull();
    expect(result.sources).toHaveLength(2);
    const [first, second] = result.sources;
    expect(first?.domain).toBe("g2.com");
    expect(first?.position).toBe(0);
    expect(first?.snippet).toBe("HubSpot is rated highly");
    expect(second?.domain).toBe("pipedrive.com");
    expect(second?.position).toBe(1);
  });

  it("returns no sources when text blocks have no citations", () => {
    const result = normalizeClaudeGroundedResponse({
      id: "msg_no_cites",
      model: "claude-sonnet-4-5",
      content: [{ type: "text", text: "Plain answer." }],
      usage: { input_tokens: 5, output_tokens: 3 },
    });
    expect(result.sources).toEqual([]);
    expect(result.rawAnswer).toBe("Plain answer.");
  });

  it("ignores citations with unsupported types", () => {
    const result = normalizeClaudeGroundedResponse({
      id: "msg_mixed",
      model: "claude-sonnet-4-5",
      content: [
        {
          type: "text",
          text: "x",
          citations: [
            {
              type: "char_location",
              url: "https://example.com",
              title: "ignored",
            },
            {
              type: "web_search_result_location",
              url: "https://kept.example",
              title: "kept",
            },
          ],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.domain).toBe("kept.example");
  });

  it("ignores citations with malformed URLs", () => {
    const result = normalizeClaudeGroundedResponse({
      id: "msg_bad_url",
      model: "claude-sonnet-4-5",
      content: [
        {
          type: "text",
          text: "x",
          citations: [
            {
              type: "web_search_result_location",
              url: "not a url",
              title: "bad",
            },
          ],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    expect(result.sources).toEqual([]);
  });

  it("throws ProxyError when there are no text blocks", () => {
    expect(() =>
      normalizeClaudeGroundedResponse({
        id: "msg_empty",
        model: "claude-sonnet-4-5",
        content: [
          { type: "server_tool_use", id: "x", name: "web_search", input: {} },
        ],
        usage: { input_tokens: 1, output_tokens: 0 },
      }),
    ).toThrow(ProxyError);
  });
});

describe("callClaudeGrounded", () => {
  it("posts to Anthropic with the web_search tool and normalises the response", async () => {
    const fakeFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      expect(String(input)).toBe("https://api.anthropic.com/v1/messages");
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.["x-api-key"]).toBe("sk-ant-test");
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        tools: Array<{ type: string; name: string }>;
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.tools[0]?.type).toBe("web_search_20250305");
      expect(body.messages[0]?.content).toBe("best CRM for small teams");
      return new Response(
        JSON.stringify({
          id: "msg_live",
          model: "claude-sonnet-4-5",
          content: [{ type: "text", text: "HubSpot." }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await callClaudeGrounded(
      { prompt: "best CRM for small teams", locale: "en-US" },
      { apiKey: "sk-ant-test", fetchImpl: fakeFetch },
    );
    expect(result.rawAnswer).toBe("HubSpot.");
  });

  it("throws ProxyError on non-200 responses", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response("server overloaded", { status: 529 });
    await expect(
      callClaudeGrounded(
        { prompt: "x", locale: "en-US" },
        { apiKey: "sk-ant-test", fetchImpl: fakeFetch },
      ),
    ).rejects.toBeInstanceOf(ProxyError);
  });

  it("throws ProxyError when apiKey is missing", async () => {
    await expect(
      callClaudeGrounded(
        { prompt: "x", locale: "en-US" },
        { apiKey: "", fetchImpl: async () => new Response() },
      ),
    ).rejects.toBeInstanceOf(ProxyError);
  });
});
