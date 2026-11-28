import { MCP_SERVER_NAME } from "@/server/mcp/identity";
import {
  CANONICAL_PRODUCTION_ORIGIN,
  resolveBetterAuthBaseUrl,
} from "@/server/better-auth/base-url";

export const builderMcpEndpoint = new URL(
  "/api/mcp",
  resolveBetterAuthBaseUrl({
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ?? CANONICAL_PRODUCTION_ORIGIN,
    VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
  }),
).href;

const mcpInitialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "ait-community-builder", version: "1.0" },
  },
};

const accept = "application/json, text/event-stream";

export function agentMcpConfig(endpoint: string, key: string) {
  return JSON.stringify(
    {
      mcpServers: {
        "ait-community": {
          type: "streamable-http",
          url: endpoint,
          headers: { Authorization: `Bearer ${key}` },
        },
      },
    },
    null,
    2,
  );
}

function quoteShell(value: string) {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

export function agentMcpRequest(endpoint: string, key?: string | null) {
  const authorization = key
    ? quoteShell(`Authorization: Bearer ${key}`)
    : '"Authorization: Bearer $AIT_AGENT_KEY"';
  return [
    `curl -i ${quoteShell(endpoint)} \\`,
    `  -H ${authorization} \\`,
    "  -H 'Content-Type: application/json' \\",
    `  -H 'Accept: ${accept}' \\`,
    `  --data ${quoteShell(JSON.stringify(mcpInitialize))}`,
  ].join("\n");
}

export type McpCheck = {
  outcome:
    | "passed"
    | "invalidKey"
    | "wrongAgent"
    | "transport"
    | "rateLimit"
    | "unavailable";
  status?: number;
};

export async function checkMcpConnection(
  key: string,
  expectedPrefix: string | null | undefined,
): Promise<McpCheck> {
  try {
    const response = await fetch("/api/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: accept,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mcpInitialize),
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const status = response.status;
    if (status === 401) return { outcome: "invalidKey", status };
    if (status === 429) return { outcome: "rateLimit", status };
    if (status >= 500) return { outcome: "unavailable", status };
    if (!response.ok) return { outcome: "transport", status };

    const payload = (await response.json().catch(() => null)) as {
      id?: number;
      result?: { protocolVersion?: string; serverInfo?: { name?: string } };
    } | null;
    if (
      payload?.id !== mcpInitialize.id ||
      typeof payload.result?.protocolVersion !== "string" ||
      payload.result.serverInfo?.name !== MCP_SERVER_NAME
    ) {
      return { outcome: "transport", status };
    }

    // Authentication alone never invokes an agent tool. The saved prefix
    // confirms the authenticated credential matches the current account key.
    const matches =
      expectedPrefix === undefined ||
      (!!expectedPrefix && key.startsWith(expectedPrefix));
    return { outcome: matches ? "passed" : "wrongAgent", status };
  } catch {
    return { outcome: "unavailable" };
  }
}
