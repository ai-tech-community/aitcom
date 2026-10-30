import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ForumThread } from "@/payload-types";
import { PICKER_LIMIT } from "@/lib/magazines/picker";
import { HUB_SLUG } from "@/server/communities/hub";

import type { ItemContext, PickerContext } from "../types";
import { loadIssueItemViews } from "../registry";
import { searchPickerCandidates } from "../pickers";
import { forumThreadItemKind } from "./kind";

const find = vi.fn();
function context(access: ItemContext["access"] = "editor") {
  return {
    payload: { find } as unknown as ItemContext["payload"],
    db: {} as ItemContext["db"],
    magazineId: 1,
    issueId: 2,
    community: { id: "community", slug: "local-builders" },
    locale: "nl",
    access,
    reader: {
      viewerId: "editor",
      hiddenCommunityIds: vi.fn(async () => new Set(["hidden"])),
      membersOnlyCommunityIds: vi.fn(async () => new Set(["private"])),
    },
  } satisfies ItemContext;
}
const thread = (
  id: number,
  overrides: Partial<ForumThread> = {},
): ForumThread => ({
  id,
  title: `Thread ${id}`,
  slug: `thread-${id}`,
  content: {
    root: {
      type: "root",
      children: [],
      direction: null,
      format: "",
      indent: 0,
      version: 1,
    },
  },
  category: "general",
  authorId: "author",
  authorName: "Sanne",
  replyCount: 42,
  lastActivityAt: "2026-10-24T10:00:00.000Z",
  communityId: "community",
  isDeleted: false,
  createdAt: "",
  updatedAt: "",
  ...overrides,
});
const stored = (threadId: number, id = `block-${threadId}`) => ({
  id,
  threadId,
  intro: "Our take",
});
beforeEach(() => find.mockReset().mockResolvedValue({ docs: [] }));

describe("forum thread item kind", () => {
  it("loads every thread of an issue in one query", async () => {
    find.mockResolvedValue({
      docs: [thread(1, { id: "1" as unknown as number })],
    });
    const views = await forumThreadItemKind.load(
      [stored(1), stored(2), stored(3)],
      context(),
    );
    expect(find).toHaveBeenCalledExactlyOnceWith({
      collection: "forum-threads",
      where: { id: { in: [1, 2, 3] } },
      depth: 0,
      locale: "nl",
      pagination: false,
    });
    expect(views.get("block-1")).toMatchObject({
      thread: { title: "Thread 1", authorName: "Sanne" },
    });
    expect(views.get("block-2")).toMatchObject({ reason: "missing" });
  });

  it("a deleted thread is missing, a private one is no_access", async () => {
    find.mockResolvedValue({
      docs: [
        thread(1, { isDeleted: true }),
        thread(2, { communityId: "hidden" }),
        thread(3, { slug: "" }),
      ],
    });
    const blocks = [1, 2, 3, 4].map((n) => ({
      blockType: "forumThread" as const,
      ...stored(n),
    }));
    expect(await loadIssueItemViews(blocks, context())).toEqual(
      ["missing", "no_access", "missing", "missing"].map((reason, i) => ({
        kind: "forumThread",
        itemId: `block-${i + 1}`,
        unavailable: true,
        reason,
      })),
    );
    expect(await loadIssueItemViews(blocks, context("full"))).toEqual([]);
  });

  it("counts replies even when Payload returns them as text", async () => {
    find.mockResolvedValue({
      docs: [
        thread(1, { replyCount: "42" as unknown as number }),
        thread(2, { replyCount: null, authorName: null, lastActivityAt: null }),
      ],
    });
    const views = await forumThreadItemKind.load(
      [stored(1), stored(2)],
      context(),
    );
    expect(views.get("block-1")).toMatchObject({ thread: { replyCount: 42 } });
    expect(views.get("block-2")).toMatchObject({
      thread: { replyCount: 0, authorName: null, lastActivityAt: null },
    });
  });

  it("links to the thread on its community's forum", async () => {
    find.mockResolvedValue({ docs: [thread(1)] });
    expect(
      (await forumThreadItemKind.load([stored(1)], context())).get("block-1"),
    ).toEqual({
      kind: "forumThread",
      itemId: "block-1",
      intro: "Our take",
      membersOnly: false,
      thread: {
        path: "/communities/local-builders/forum/thread-1",
        title: "Thread 1",
        replyCount: 42,
        authorName: "Sanne",
        lastActivityAt: "2026-10-24T10:00:00.000Z",
      },
    });
    find.mockResolvedValue({ docs: [thread(1, { communityId: null })] });
    const ctx = context();
    ctx.community = { id: "hub", slug: HUB_SLUG };
    expect(
      (await forumThreadItemKind.load([stored(1)], ctx)).get("block-1"),
    ).toMatchObject({
      thread: { path: `/communities/${HUB_SLUG}/forum/thread-1` },
    });
  });

  it("flags threads of a members-only community through the shared rule", async () => {
    find.mockResolvedValue({ docs: [thread(1, { communityId: "private" })] });
    expect(
      (await forumThreadItemKind.load([stored(1)], context())).get("block-1"),
    ).toMatchObject({ membersOnly: true });
    const ctx = context("full");
    expect(
      (await forumThreadItemKind.load([stored(1)], ctx)).get("block-1"),
    ).toMatchObject({ membersOnly: false });
    expect(ctx.reader.membersOnlyCommunityIds).not.toHaveBeenCalled();
  });

  it("refuses another community's thread", async () => {
    find.mockResolvedValue({
      docs: [
        thread(1, { communityId: "other" }),
        thread(2, { isDeleted: true }),
        thread(3, { communityId: "hidden" }),
        thread(5),
      ],
    });
    const items = [1, 2, 3, 4, 5].map((id, index) => ({
      index,
      stored: stored(id),
      isNew: true,
    }));
    expect(await forumThreadItemKind.validate(items, context())).toEqual(
      [0, 1, 2, 3].map((itemIndex) => ({ itemIndex, code: "ITEM_INVALID" })),
    );
    expect(find).toHaveBeenCalledTimes(1);
    expect(
      await forumThreadItemKind.validate(
        items.map((i) => ({ ...i, isNew: false })),
        context(),
      ),
    ).toEqual([]);
    expect(
      await forumThreadItemKind.validate(
        [items[4]!, { ...items[4]!, index: 5 }],
        context(),
      ),
    ).toEqual([{ itemIndex: 5, code: "ITEM_INVALID", detail: "duplicate" }]);
  });

  it("accepts an unscoped thread only in the Hub's magazine", async () => {
    find.mockResolvedValue({ docs: [thread(1, { communityId: null })] });
    const items = [{ index: 0, stored: stored(1), isNew: true }];
    const ctx = context();
    expect(await forumThreadItemKind.validate(items, ctx)).toEqual([
      { itemIndex: 0, code: "ITEM_INVALID" },
    ]);
    ctx.community = { id: "hub", slug: HUB_SLUG };
    expect(await forumThreadItemKind.validate(items, ctx)).toEqual([]);
  });

  it("round-trips numeric ids and keeps the intro", () => {
    const saved = forumThreadItemKind.toStored({
      kind: "forumThread",
      threadId: 7,
      intro: " Our take ",
    });
    expect(saved).toEqual({ threadId: 7, intro: "Our take" });
    const fromPayload = { ...saved, threadId: "7" as unknown as number };
    expect(forumThreadItemKind.toInput(fromPayload)).toEqual({
      kind: "forumThread",
      threadId: 7,
      intro: "Our take",
    });
    expect(forumThreadItemKind.referenceOf(fromPayload)).toBe("forumThread:7");
    for (const threadId of [0, -1, 1.5])
      expect(
        forumThreadItemKind.input.safeParse({ kind: "forumThread", threadId })
          .success,
      ).toBe(false);
  });
});

describe("forum thread picker", () => {
  it("offers this community's undeleted threads with reply, date and byline facts", async () => {
    find.mockResolvedValue({
      docs: [
        thread(1, { replyCount: "42" as unknown as number }),
        thread(2, { lastActivityAt: null, authorName: null, replyCount: null }),
      ],
    });
    const ctx = context();
    const pickerCtx: PickerContext = {
      deps: { payload: ctx.payload, db: ctx.db },
      magazineId: 1,
      community: ctx.community,
      viewerId: "editor",
      locale: "nl",
    };
    const candidates = await searchPickerCandidates(
      "forumThread",
      "",
      pickerCtx,
    );
    expect(find).toHaveBeenLastCalledWith({
      collection: "forum-threads",
      where: {
        and: [
          { communityId: { equals: "community" } },
          { isDeleted: { not_equals: true } },
        ],
      },
      sort: "-lastActivityAt",
      depth: 0,
      locale: "nl",
      limit: PICKER_LIMIT,
    });
    expect(candidates[0]).toEqual({
      input: { kind: "forumThread", threadId: 1 },
      reference: "forumThread:1",
      title: "Thread 1",
      facts: [
        { type: "count", what: "replies", value: 42 },
        { type: "date", label: "lastActive", at: "2026-10-24T10:00:00.000Z" },
        { type: "byline", name: "Sanne" },
      ],
      openHref: null,
    });
    expect(candidates[1]!.facts).toEqual([
      { type: "count", what: "replies", value: 0 },
    ]);
    await searchPickerCandidates("forumThread", "models", pickerCtx);
    expect(find.mock.lastCall![0].where.and).toContainEqual({
      title: { like: "models" },
    });
    await searchPickerCandidates("forumThread", "", {
      ...pickerCtx,
      community: { id: "hub", slug: HUB_SLUG },
    });
    expect(find.mock.lastCall![0].where.and[0]).toEqual({
      or: [
        { communityId: { equals: "hub" } },
        { communityId: { exists: false } },
      ],
    });
  });
});
