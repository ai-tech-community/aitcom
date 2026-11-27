// @vitest-environment node
import { expect, it, vi } from "vitest";
import { communitySourcesRouter } from "./community-news-sources";

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/better-auth", () => ({ auth: {} }));
vi.mock("@/server/news/discover-feed", () => ({
  discoverFeed: vi.fn(async () => ({
    kind: "feed",
    name: "Publisher",
    url: "https://publisher.test/feed",
  })),
}));

function context(communityId: string, role: string) {
  const insertValues = vi.fn(() => ({ onConflictDoNothing: vi.fn() }));
  const tx = {
    insert: () => ({ values: insertValues }),
    select: () => ({
      from: () => ({
        where: () => ({ for: async () => [{ id: "shared-feed" }] }),
      }),
    }),
  };
  const transaction = vi.fn(async (run: (store: typeof tx) => Promise<void>) =>
    run(tx),
  );
  const database = {
    transaction,
    query: {
      communities: { findFirst: async () => ({ id: communityId }) },
      communityMemberships: {
        findFirst: async () => ({ status: "active", role }),
      },
    },
  };
  const caller = communitySourcesRouter.createCaller({
    db: database as never,
    headers: new Headers(),
    session: { user: { id: "person" } } as never,
  });
  return { caller, transaction, insertValues };
}
it("checks the membership of the target community before changing sources", async () => {
  const { caller, transaction } = context("other", "moderator");
  await expect(
    caller.add({ slug: "other", url: "https://publisher.test/feed" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(transaction).not.toHaveBeenCalled();
});
it("registers and selects in one transaction and lets a second community select the shared ID", async () => {
  const first = context("first", "admin");
  await first.caller.add({ slug: "first", url: "https://publisher.test/feed" });
  expect(first.transaction).toHaveBeenCalledTimes(1);
  expect(first.insertValues).toHaveBeenLastCalledWith({
    communityId: "first",
    feedId: "shared-feed",
  });
  const second = context("second", "owner");
  await second.caller.select({ slug: "second", feedId: "shared-feed" });
  expect(second.insertValues).toHaveBeenCalledExactlyOnceWith({
    communityId: "second",
    feedId: "shared-feed",
  });
});
