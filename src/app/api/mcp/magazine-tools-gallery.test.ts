// @vitest-environment node
/**
 * save-magazine-issue and gallery items, end to end through the MCP tool:
 * an MCP client calls the registered tool, the SDK checks the tool's input
 * schema, the agent tRPC procedure parses it again, and the real agent issue
 * service decides. Payload and the database are fakes. An agent may keep a
 * gallery item an editor placed but not add one (spec 2026-11-13, Magazine).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, expect, it, vi } from "vitest";

import type * as ArticlePlacement from "@/server/magazines/article-placement";
import type * as PayloadWrites from "@/server/magazines/payload-writes";

vi.hoisted(() => {
  process.env.DATABASE_URL ??=
    "postgresql://placeholder:placeholder@127.0.0.1:1/placeholder";
  process.env.BETTER_AUTH_SECRET ??= "test-secret";
  process.env.BETTER_AUTH_GITHUB_CLIENT_ID ??= "github-id";
  process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET ??= "github-secret";
});

const m = vi.hoisted(() => ({
  payload: null as unknown,
}));

vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: async () => ({
    agentId: "agent-1",
    ownerId: "owner",
    scopes: ["read", "contribute"],
  }),
}));
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => m.payload,
}));
vi.mock("@/server/magazines/issue-service", () => ({
  createIssue: async () => undefined,
  publishIssue: async () => undefined,
}));
vi.mock("@/server/magazines/payload-writes", async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadWrites>()),
  inPayloadTransaction: async (
    _payload: unknown,
    work: (tx: unknown) => Promise<unknown>,
  ) => work({ req: undefined, execute: async () => [{ id: 9 }] }),
}));
vi.mock("@/server/magazines/article-placement", async (importOriginal) => ({
  ...(await importOriginal<typeof ArticlePlacement>()),
  syncArticlePlacement: async () => undefined,
}));

import { createTRPCRouter } from "@/server/api/trpc";
import { agentMagazineRouter } from "@/server/api/routers/agent-magazines";
import { ITEM_KINDS } from "@/server/magazines/items/registry";

import { mcpIssueItemSchema, registerMagazineTools } from "./magazine-tools";

const REFUSAL =
  "Item 2 is a photo or video from the community gallery. Agents can't add gallery items to an issue: an editor adds them in the issue builder, which checks who may see each one and that its uploader agreed. You can keep gallery items that are already in the issue.";

/** A draft issue the agent drafted, holding a gallery item an editor placed. */
const draftIssue = {
  id: 9,
  magazine: 1,
  title: "Autumn",
  slug: "autumn",
  number: 3,
  status: "draft" as const,
  coverImageUrl: null,
  items: [
    { blockType: "galleryItem", id: "g1", intro: null, galleryItemId: 12 },
  ],
  updatedAt: "2026-11-14T10:00:00.000Z",
};

function fakePayload() {
  return {
    find: vi.fn(async ({ collection }: { collection: string }) =>
      collection === "magazines"
        ? {
            docs: [
              {
                id: 1,
                slug: "town",
                name: "Town",
                communityId: "c1",
                defaultVisibility: "members",
              },
            ],
          }
        : { docs: [] },
    ),
    findByID: vi.fn(async () => draftIssue),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...draftIssue,
      ...data,
      updatedAt: "2026-11-14T10:05:00.000Z",
    })),
    create: vi.fn(),
  };
}

const db = {
  query: {
    communities: {
      findFirst: async () => ({
        id: "c1",
        slug: "town",
        name: "Town",
        isListedInDirectory: true,
        deletedAt: null,
      }),
    },
  },
  // findOwnedDraft: this agent's own draft of the issue.
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => [{ id: "draft-1", status: "draft", targetId: "9" }],
      }),
    }),
  }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
  insert: vi.fn(),
};

/** Calls save-magazine-issue as an MCP client would. */
async function callSaveIssue(items: unknown[]) {
  const caller = createTRPCRouter({ agent: agentMagazineRouter }).createCaller({
    db: db as never,
    session: null,
    headers: new Headers({ authorization: "Bearer test-agent-key" }),
  });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerMagazineTools(server, caller as never);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "agent", version: "0.0.0" });
  await client.connect(clientSide);
  try {
    const result = await client.callTool({
      name: "save-magazine-issue",
      arguments: {
        magazineSlug: "town",
        issueId: 9,
        items,
        expectedUpdatedAt: draftIssue.updatedAt,
      },
    });
    return result as {
      isError?: boolean;
      content: Array<{ type: string; text: string }>;
    };
  } finally {
    await client.close();
  }
}

let payload: ReturnType<typeof fakePayload>;

beforeEach(() => {
  payload = fakePayload();
  m.payload = payload;
});

it("keeps a gallery item an editor placed when the agent sends it back", async () => {
  const result = await callSaveIssue([
    { kind: "editorial", heading: "Notes", body: "A word from the agent." },
    { kind: "galleryItem", id: "g1", galleryItemId: 12 },
  ]);

  expect(result.isError).toBeFalsy();
  expect(payload.update).toHaveBeenCalledOnce();
  const { data } = payload.update.mock.calls[0]![0] as {
    data: { items: Array<Record<string, unknown>> };
  };
  expect(data.items.map((block) => block.blockType)).toEqual([
    "editorial",
    "galleryItem",
  ]);
  expect(data.items[1]).toMatchObject({ id: "g1", galleryItemId: 12 });
  const saved = JSON.parse(result.content[0]!.text) as {
    items: Array<Record<string, unknown>>;
  };
  expect(saved.items[1]).toMatchObject({
    kind: "galleryItem",
    galleryItemId: 12,
  });
});

it("refuses a new gallery item with the plain message and saves nothing", async () => {
  const result = await callSaveIssue([
    { kind: "galleryItem", id: "g1", galleryItemId: 12 },
    { kind: "galleryItem", galleryItemId: 13 },
  ]);

  expect(result.isError).toBe(true);
  expect(result.content[0]!.text).toBe(REFUSAL);
  expect(payload.update).not.toHaveBeenCalled();
});

it("refuses the same kept gallery item sent twice, by the duplicate rule", async () => {
  const result = await callSaveIssue([
    { kind: "galleryItem", id: "g1", galleryItemId: 12 },
    { kind: "galleryItem", galleryItemId: 12 },
  ]);

  // Both copies are kept items (not new), so only the duplicate rule refuses.
  expect(result.isError).toBe(true);
  expect(result.content[0]!.text).toBe("ITEM_INVALID");
  expect(payload.update).not.toHaveBeenCalled();
});

it("lists every item kind the registry has, so agents can send back any item", () => {
  const mcpKinds = mcpIssueItemSchema.options.map(
    (option) => option.shape.kind.value,
  );
  expect([...mcpKinds].sort()).toEqual(Object.keys(ITEM_KINDS).sort());
});
