import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MagazineIssue } from "@/payload-types";
import { hiddenContentCommunityIds } from "@/server/communities/content-visibility-queries";

import type { Deps } from "./deps";
import { setIssueItems } from "./issue-service";

vi.mock("@/server/communities/content-visibility-queries", () => ({
  hiddenContentCommunityIds: vi.fn(async () => []),
}));
vi.mock("./article-placement", () => ({
  placedArticlesOf: () => [],
  syncArticlePlacement: vi.fn(async () => undefined),
}));
vi.mock("./article-publication", () => ({
  creditPendingMagazineArticles: vi.fn(async () => undefined),
  publishPlacedArticles: vi.fn(async () => undefined),
}));
vi.mock("./payload-writes", () => ({
  inPayloadTransaction: async (
    _payload: unknown,
    work: (tx: unknown) => Promise<unknown>,
  ) => work({ req: undefined, execute: async () => [{ id: 1 }] }),
  isConcurrencyAbort: () => false,
  uniqueViolationPath: () => null,
}));

beforeEach(() => vi.clearAllMocks());

describe("saving issue items", () => {
  it("shares community sets between validation and the returned editor views", async () => {
    const issue = {
      id: 1,
      magazine: 7,
      communityId: "community",
      status: "draft",
      updatedAt: "2026-10-27T10:00:00.000Z",
      items: [],
    } as unknown as MagazineIssue;
    const saved = {
      ...issue,
      items: [{ blockType: "event", id: "block", eventId: 42, intro: null }],
    } as MagazineIssue;
    const find = vi.fn(async () => ({
      docs: [
        {
          id: 42,
          slug: "gathering",
          title: "Gathering",
          status: "published",
          communityId: "community",
          date: "2026-10-28T10:00:00.000Z",
        },
      ],
    }));
    const deps = {
      db: {},
      payload: { find, update: vi.fn(async () => saved) },
    } as unknown as Deps;

    const result = await setIssueItems(
      deps,
      issue,
      [{ kind: "event", eventId: 42 }],
      issue.updatedAt,
      {
        userId: "editor",
        community: {
          id: "community",
          slug: "community",
          isListedInDirectory: true,
        },
      },
    );

    expect(result).toMatchObject({
      issue: saved,
      items: [
        { kind: "event", itemId: "block", event: { title: "Gathering" } },
      ],
    });
    expect(hiddenContentCommunityIds).toHaveBeenCalledTimes(2);
    expect(hiddenContentCommunityIds).toHaveBeenCalledWith(deps.db, "editor");
    expect(hiddenContentCommunityIds).toHaveBeenCalledWith(deps.db, null);
  });
});
