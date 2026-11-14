// @vitest-environment node
/**
 * Agents and gallery items in an issue (spec 2026-11-13, Magazine): an agent
 * may keep the gallery items an editor placed, may remove them like any other
 * item, but may not add new ones. Each kind's own `validate` is stubbed here;
 * the registry's real "is this item new" rule decides.
 */
import { beforeEach, expect, it, vi } from "vitest";

import type * as ArticlePlacement from "./article-placement";
import type * as Registry from "./items/registry";
import type * as PayloadWrites from "./payload-writes";

vi.hoisted(() => {
  process.env.DATABASE_URL ??=
    "postgresql://placeholder:placeholder@127.0.0.1:1/placeholder";
  process.env.BETTER_AUTH_SECRET ??= "test-secret";
  process.env.BETTER_AUTH_GITHUB_CLIENT_ID ??= "github-id";
  process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET ??= "github-secret";
});

const m = vi.hoisted(() => ({
  createIssue: vi.fn(),
  validateIssueItems: vi.fn(),
}));

vi.mock("./issue-service", () => ({
  createIssue: async (...args: unknown[]) => {
    await m.createIssue(...args);
  },
  publishIssue: async () => undefined,
}));
vi.mock("./items/registry", async (importOriginal) => ({
  ...(await importOriginal<typeof Registry>()),
  validateIssueItems: m.validateIssueItems,
}));
vi.mock("./payload-writes", async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadWrites>()),
  inPayloadTransaction: async (
    _payload: unknown,
    work: (tx: unknown) => Promise<unknown>,
  ) => work({ req: undefined, execute: async () => [{ id: 9 }] }),
}));
vi.mock("./article-placement", async (importOriginal) => ({
  ...(await importOriginal<typeof ArticlePlacement>()),
  syncArticlePlacement: async () => undefined,
}));

import { saveMagazineIssue } from "./agent-magazine";

const REFUSAL =
  "Item 2 is a photo or video from the community gallery. Agents can't add gallery items to an issue: an editor adds them in the issue builder, which checks who may see each one and that its uploader agreed. You can keep gallery items that are already in the issue.";

const magazine = {
  id: 1,
  slug: "town",
  name: "Town",
  communityId: "c1",
  defaultVisibility: "members",
};

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

function fakes() {
  const payload = {
    find: vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === "magazines") return { docs: [magazine] };
      return { docs: [] };
    }),
    findByID: vi.fn(async () => draftIssue),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...draftIssue,
      ...data,
      updatedAt: "2026-11-14T10:05:00.000Z",
    })),
    create: vi.fn(),
  };
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
          limit: async () => [
            { id: "draft-1", status: "draft", targetId: "9" },
          ],
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: vi.fn(),
  };
  return { deps: { db, payload } as never, payload, db };
}

const AGENT = { agentId: "agent-1", ownerId: "owner" };

function edit(items: unknown[]) {
  return {
    magazineSlug: "town",
    issueId: 9,
    items: items as never,
    expectedUpdatedAt: draftIssue.updatedAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.validateIssueItems.mockResolvedValue([]);
});

it("keeps a gallery item an editor placed when the agent sends it back", async () => {
  const { deps, payload } = fakes();
  const result = await saveMagazineIssue(
    deps,
    AGENT,
    edit([
      { kind: "galleryItem", id: "g1", galleryItemId: 12 },
      { kind: "editorial", heading: "Notes", body: "A word from the agent." },
    ]),
  );

  expect(payload.update).toHaveBeenCalledOnce();
  const { data } = payload.update.mock.calls[0]![0] as {
    data: { items: Array<Record<string, unknown>> };
  };
  expect(data.items[0]).toMatchObject({
    blockType: "galleryItem",
    id: "g1",
    galleryItemId: 12,
  });
  expect(result.items[0]).toMatchObject({
    kind: "galleryItem",
    galleryItemId: 12,
  });
  // The kind's own checks still run on the kept item.
  expect(m.validateIssueItems).toHaveBeenCalledOnce();
});

it("refuses a new gallery item, plainly, and saves nothing", async () => {
  const { deps, payload } = fakes();
  await expect(
    saveMagazineIssue(
      deps,
      AGENT,
      edit([
        { kind: "galleryItem", id: "g1", galleryItemId: 12 },
        { kind: "galleryItem", galleryItemId: 13 },
      ]),
    ),
  ).rejects.toMatchObject({ code: "BAD_REQUEST", message: REFUSAL });
  expect(payload.update).not.toHaveBeenCalled();
  expect(m.validateIssueItems).not.toHaveBeenCalled();
});

it("lets the agent remove a gallery item by leaving it out, like any item", async () => {
  const { deps, payload } = fakes();
  const result = await saveMagazineIssue(
    deps,
    AGENT,
    edit([{ kind: "editorial", heading: "Notes", body: "Only words now." }]),
  );

  const { data } = payload.update.mock.calls[0]![0] as {
    data: { items: Array<Record<string, unknown>> };
  };
  expect(data.items.map((block) => block.blockType)).toEqual(["editorial"]);
  expect(result.items.map((item) => item.kind)).toEqual(["editorial"]);
});

it("refuses a gallery item in a new issue before any issue exists", async () => {
  const { deps, payload, db } = fakes();
  await expect(
    saveMagazineIssue(deps, AGENT, {
      magazineSlug: "town",
      title: "Winter",
      items: [
        { kind: "editorial", heading: "Hello", body: "Welcome." },
        { kind: "galleryItem", galleryItemId: 12 },
      ] as never,
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST", message: REFUSAL });
  expect(m.createIssue).not.toHaveBeenCalled();
  expect(payload.create).not.toHaveBeenCalled();
  expect(db.insert).not.toHaveBeenCalled();
});
