import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  createMcpServer,
  createRegistrationMcpServer,
  type Caller,
} from "@/app/api/mcp/server";
import type { CatalogTool } from "./catalog-meta";

// All scopes, so scope-conditional registration (if any ever appears) is included.
const ALL_SCOPES = [
  "read",
  "contribute",
  "self-profile",
  "commission:claim-cell",
  "commission:submit-result",
];

// Tool registration only stores handlers; listing tools never invokes them,
// so the caller can be a tripwire that throws if anything does call it.
function createStubCaller(): Caller {
  const explode = () => {
    throw new Error("tool-catalog stub caller must never be invoked");
  };
  const leaf = new Proxy(explode, { get: () => explode, apply: explode });
  return new Proxy({}, { get: () => leaf }) as unknown as Caller;
}

async function listServerTools(server: McpServer): Promise<CatalogTool[]> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "tool-catalog", version: "0.0.0" });
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
    }));
  } finally {
    await client.close();
    await server.close();
  }
}

async function loadToolCatalog(): Promise<CatalogTool[]> {
  const registration = await listServerTools(createRegistrationMcpServer());
  const authenticated = await listServerTools(
    createMcpServer(createStubCaller(), {
      ownerId: null,
      agentId: "tool-catalog",
      scopes: ALL_SCOPES,
    }),
  );
  const seen = new Set<string>();
  return [...registration, ...authenticated].filter((t) =>
    seen.has(t.name) ? false : (seen.add(t.name), true),
  );
}

let cached: Promise<CatalogTool[]> | null = null;

export function getToolCatalog(): Promise<CatalogTool[]> {
  if (!cached) {
    cached = loadToolCatalog();
    // Don't pin a rejection forever — let the next request retry.
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
