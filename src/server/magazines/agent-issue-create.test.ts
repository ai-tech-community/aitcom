// @vitest-environment node

import { beforeEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??=
    "postgresql://placeholder:placeholder@127.0.0.1:1/placeholder";
  process.env.BETTER_AUTH_SECRET ??= "test-secret";
  process.env.BETTER_AUTH_GITHUB_CLIENT_ID ??= "github-id";
  process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET ??= "github-secret";
});

const createIssue = vi.hoisted(() => vi.fn());

vi.mock("./issue-service", () => ({
  createIssue: async (...args: unknown[]) => {
    await createIssue(...args);
  },
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

const draftArticle = {
  id: 47,
  magazine: 1,
  reviewStatus: "draft",
  status: "draft",
  magazineIssue: null,
  authorId: "owner",
  authorName: "greg",
};

beforeEach(() => {
  createIssue.mockReset();
});

it("does not create an issue when a draft article is not ready", async () => {
  const insert = vi.fn();
  const payload = {
    find: vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === "magazines") return { docs: [magazine] };
      if (collection === "articles") return { docs: [draftArticle] };
      return { docs: [] };
    }),
    create: vi.fn(),
    update: vi.fn(),
  };
  const db = {
    query: {
      communities: {
        findFirst: vi.fn(async () => ({
          id: "c1",
          slug: "town",
          name: "Town",
          isListedInDirectory: true,
          deletedAt: null,
        })),
      },
    },
    insert,
  };

  await expect(
    saveMagazineIssue(
      { db, payload } as never,
      { agentId: "agent-1", ownerId: "owner" },
      {
        magazineSlug: "town",
        title: "Empty on failure",
        items: [{ kind: "article", articleId: 47 }],
      },
    ),
  ).rejects.toMatchObject({ message: "ARTICLE_NOT_READY" });

  expect(createIssue).not.toHaveBeenCalled();
  expect(payload.create).not.toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();
});

it("does not create an issue for the agent's own draft article id", async () => {
  const ownDraft = { ...draftArticle, id: 53 };
  const payload = {
    find: vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === "magazines") return { docs: [magazine] };
      if (collection === "articles") return { docs: [ownDraft] };
      return { docs: [] };
    }),
    create: vi.fn(),
  };
  const db = {
    query: {
      communities: {
        findFirst: vi.fn(async () => ({
          id: "c1",
          slug: "town",
          name: "Town",
          isListedInDirectory: true,
          deletedAt: null,
        })),
      },
    },
    insert: vi.fn(),
  };

  await expect(
    saveMagazineIssue(
      { db, payload } as never,
      { agentId: "agent-1", ownerId: "owner" },
      {
        magazineSlug: "town",
        title: "Issue 6",
        articleIds: [53],
      },
    ),
  ).rejects.toMatchObject({ message: "ARTICLE_NOT_READY" });

  expect(createIssue).not.toHaveBeenCalled();
  expect(payload.create).not.toHaveBeenCalled();
});
