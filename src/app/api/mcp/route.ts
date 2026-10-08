import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { db } from "@/server/db";
import { validateApiKey } from "@/server/agent/api-key";
import { checkRegistrationRateLimit } from "@/server/agent/rate-limit";
import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { MCP_SERVER_NAME } from "@/server/mcp/identity";
import {
  createMcpServer,
  createRegistrationMcpServer,
  type AgentKeyData,
} from "./server";

// ── Auth helper ─────────────────────────────────────────────────────────────
//
// NOTE: We do NOT call checkRateLimit here. Rate limiting is enforced inside
// the agentAuth tRPC middleware (trpc.ts), which runs on every tool invocation.
// Calling checkRateLimit twice would consume two tokens per request, halving
// the effective limit. The key is validated here only to route the request:
// a valid key reaches the authenticated server, where the tRPC middleware
// re-validates and rate-limits; a bad key gets 401; no key gets registration.

type AuthResult =
  | { kind: "anonymous" }
  | { kind: "invalid" }
  | { kind: "agent"; keyData: AgentKeyData };

async function authenticateRequest(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { kind: "anonymous" };

  const keyData = await validateApiKey(db, authHeader.slice(7));
  return keyData ? { kind: "agent", keyData } : { kind: "invalid" };
}

// A presented key that does not validate (unknown, revoked, or a suspended
// agent) is an auth failure, not an anonymous visit: answer 401 per RFC 6750
// so clients see the real problem instead of a silently shrunken tool list.
// Only a request with no credentials falls through to the registration tools.
function invalidTokenResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "invalid_token",
      error_description:
        "The API key is invalid, revoked, or belongs to a suspended agent. Omit the Authorization header to reach the registration tools.",
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer realm="${MCP_SERVER_NAME}", error="invalid_token"`,
      },
    },
  );
}

// ── Route handlers ──────────────────────────────────────────────────────────

async function handleMcpRequest(req: Request): Promise<Response> {
  const auth = await authenticateRequest(req);

  if (auth.kind === "agent") {
    const { keyData } = auth;
    const ctx = await createTRPCContext({ headers: req.headers });
    const caller = createCaller(ctx);
    const server = createMcpServer(caller, keyData);
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(req);
  }

  // No valid key: anonymous visitors and failed keys share one per-IP budget,
  // so a bad key never buys more attempts than registration does.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const regLimit = checkRegistrationRateLimit(ip);
  if (!regLimit.allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (auth.kind === "invalid") return invalidTokenResponse();

  // Anonymous — registration tools only
  const server = createRegistrationMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export async function GET(req: Request) {
  return handleMcpRequest(req);
}

export async function POST(req: Request) {
  return handleMcpRequest(req);
}

export async function DELETE(req: Request) {
  return handleMcpRequest(req);
}
