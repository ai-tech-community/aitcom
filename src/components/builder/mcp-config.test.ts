import { afterEach, describe, expect, it, vi } from "vitest";
import { MCP_ENDPOINT } from "@/lib/setup-guide";
import {
  agentMcpConfig,
  agentMcpRequest,
  checkMcpConnection,
} from "./mcp-config";

describe("builder MCP examples", () => {
  it("includes the supplied key as a Bearer header for the existing HTTP server", () => {
    const key = 'sample-"key"';
    expect(JSON.parse(agentMcpConfig(MCP_ENDPOINT, key))).toEqual({
      mcpServers: {
        "ait-community": {
          type: "streamable-http",
          url: MCP_ENDPOINT,
          headers: { Authorization: `Bearer ${key}` },
        },
      },
    });
  });

  it("initializes the protocol and reads the credential from the shell", () => {
    const request = agentMcpRequest(MCP_ENDPOINT);
    expect(request).toContain(`curl -i '${MCP_ENDPOINT}'`);
    expect(request).toContain('"Authorization: Bearer $AIT_AGENT_KEY"');
    expect(request).toContain("Accept: application/json, text/event-stream");
    const body = /--data '(.+)'$/.exec(request)?.[1];
    expect(JSON.parse(body ?? "")).toMatchObject({
      jsonrpc: "2.0",
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {} },
    });
  });
});

describe("builder MCP check", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("pastes a supplied credential into the terminal example", () => {
    const request = agentMcpRequest(MCP_ENDPOINT, "ait_sk_demo");
    expect(request).toContain("'Authorization: Bearer ait_sk_demo'");
    expect(request).not.toContain("$AIT_AGENT_KEY");
  });

  const acceptedHandshake = {
    id: 1,
    result: {
      protocolVersion: "2025-03-26",
      serverInfo: { name: "aitcommunity" },
    },
  };

  it("checks the existing authenticated handshake without invoking a tool", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(acceptedHandshake));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      checkMcpConnection("ait_sk_demo-delivered", "ait_sk_demo"),
    ).resolves.toEqual({
      outcome: "passed",
      status: 200,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/mcp",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer ait_sk_demo-delivered",
        }),
        redirect: "error",
      }),
    );
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({
      method: "initialize",
    });
  });

  it("does not accept another agent’s valid key as the current key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(acceptedHandshake)),
    );
    await expect(
      checkMcpConnection("ait_sk_other", "ait_sk_demo"),
    ).resolves.toEqual({
      outcome: "wrongAgent",
      status: 200,
    });
  });

  it.each([
    [401, "invalidKey"],
    [406, "transport"],
    [429, "rateLimit"],
    [503, "unavailable"],
    [200, "transport"],
  ])(
    "reports HTTP %s without inventing a successful profile check",
    async (status, outcome) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("{}", { status })),
      );
      await expect(
        checkMcpConnection("ait_sk_demo", "agent-1"),
      ).resolves.toEqual({
        outcome,
        status,
      });
    },
  );
});

describe("builder MCP endpoint", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the app's canonical production origin for published config", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://aitcommunity.org");
    vi.resetModules();
    const { builderMcpEndpoint } = await import("./mcp-config");
    expect(builderMcpEndpoint).toBe(MCP_ENDPOINT);
  });

  it("uses the configured URL for the local demo", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3103");
    vi.resetModules();
    const { builderMcpEndpoint } = await import("./mcp-config");
    expect(builderMcpEndpoint).toBe("http://localhost:3103/api/mcp");
  });
});
