import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { db } from "@/server/db";
import { validateApiKey } from "@/server/agent/api-key";
import { checkRegistrationRateLimit } from "@/server/agent/rate-limit";
import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { createMcpServer, createRegistrationMcpServer } from "./server";

// ── Auth helper ─────────────────────────────────────────────────────────────
//
// NOTE: We do NOT call checkRateLimit here. Rate limiting is enforced inside
// the agentAuth tRPC middleware (trpc.ts), which runs on every tool invocation.
// Calling checkRateLimit twice would consume two tokens per request, halving
// the effective limit. We also avoid a redundant validateApiKey DB round-trip
// by deferring full validation to the tRPC layer — this function just checks
// whether a Bearer token is present and valid enough to route to the
// authenticated MCP server (the tRPC middleware re-validates and rate-limits).

async function authenticateRequest(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const apiKey = authHeader.slice(7);
  const keyData = await validateApiKey(db, apiKey);
  if (!keyData) return null;

  return keyData;
}

// ── Route handlers ──────────────────────────────────────────────────────────

async function handleMcpRequest(req: Request): Promise<Response> {
  const keyData = await authenticateRequest(req);

  if (keyData) {
    const ctx = await createTRPCContext({ headers: req.headers });
    const caller = createCaller(ctx);
    const server = createMcpServer(caller, keyData);
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(req);
  }

  // Unauthenticated — registration tools only
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
