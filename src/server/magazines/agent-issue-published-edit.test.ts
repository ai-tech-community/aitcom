// @vitest-environment node

import { beforeEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??=
    "postgresql://placeholder:placeholder@127.0.0.1:1/placeholder";
  process.env.BETTER_AUTH_SECRET ??= "test-secret";
  process.env.BETTER_AUTH_GITHUB_CLIENT_ID ??= "github-id";
  process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET ??= "github-secret";
});

vi.mock("./issue-service", () => ({
  createIssue: async () => undefined,
  publishIssue: async () => undefined,
}));

import { saveMagazineIssue } from "./agent-magazine";

const magazine = {
  id: 1,
  slug: "town",
  name: "Town",
  communityId: "c1",
  defaultVisibility: "members",
};

const published = {
  id: 9,
  magazine: 1,
  title: "Published",
  slug: "published",
  number: 2,
  status: "published" as const,
  coverImageUrl: null,
  items: [],
  updatedAt: "2026-10-29T00:00:00.000Z",
};

function deps(role: "editor" | "member") {
  const inserted: Array<Record<string, unknown>> = [];
  const payload = {
    find: vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === "magazines") return { docs: [magazine] };
      return { docs: [] };
    }),
    findByID: vi.fn(async () => published),
    update: vi.fn(),
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
      communityMemberships: {
        findFirst: async () => ({ role: "member", status: "active" }),
      },
      magazineStaff: {
        findFirst: async () =>
          role === "editor" ? { role: "editor" } : undefined,
      },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        inserted.push(row);
      },
    }),
  };
  return { deps: { db, payload } as never, payload, inserted };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it("proposes a cover change for a published issue instead of writing it", async () => {
  const { deps: depsArg, payload, inserted } = deps("editor");
  const result = await saveMagazineIssue(
    depsArg,
    { agentId: "agent-1", ownerId: "owner" },
    {
      magazineSlug: "town",
      issueId: 9,
      coverImageUrl: "https://cdn.example.test/cover.png",
      coverAlt: "Breakfast",
    },
  );
  expect(result.review).toBe("pending");
  expect(payload.update).not.toHaveBeenCalled();
  expect(inserted).toHaveLength(1);
  expect(inserted[0]).toMatchObject({
    type: "magazine_issue_update",
    ownerId: "owner",
    status: "pending",
    targetId: "9",
  });
  expect(inserted[0]?.metadata).toMatchObject({
    coverImageUrl: "https://cdn.example.test/cover.png",
    coverAlt: "Breakfast",
    coverMediaId: null,
  });
});

it("explains why someone who is not an editor cannot change a published issue", async () => {
  const { deps: depsArg, payload, inserted } = deps("member");
  await expect(
    saveMagazineIssue(
      depsArg,
      { agentId: "agent-1", ownerId: "owner" },
      {
        magazineSlug: "town",
        issueId: 9,
        title: "New title",
      },
    ),
  ).rejects.toMatchObject({
    message: expect.stringMatching(/magazine editor/),
  });
  expect(payload.update).not.toHaveBeenCalled();
  expect(inserted).toHaveLength(0);
});
