import { beforeEach, describe, expect, it, vi } from "vitest";

import { hiddenContentCommunityIds } from "@/server/communities/content-visibility-queries";

import type { Deps } from "../deps";
import { createItemReader } from "./reader";

vi.mock("@/server/communities/content-visibility-queries", () => ({
  hiddenContentCommunityIds: vi.fn(),
}));

const database = {} as Deps["db"];
const hiddenIds = vi.mocked(hiddenContentCommunityIds);

beforeEach(() => {
  hiddenIds.mockReset();
  hiddenIds.mockImplementation(async (_db, viewerId) =>
    viewerId === null ? ["private", "members-community"] : ["private"],
  );
});

describe("item reader", () => {
  it("loads each community set once, on first use", async () => {
    const reader = createItemReader(database, "viewer");
    expect(reader.viewerId).toBe("viewer");
    expect(hiddenIds).not.toHaveBeenCalled();

    const [hidden, hiddenAgain, membersOnly, membersOnlyAgain] =
      await Promise.all([
        reader.hiddenCommunityIds(),
        reader.hiddenCommunityIds(),
        reader.membersOnlyCommunityIds(),
        reader.membersOnlyCommunityIds(),
      ]);

    expect(hiddenIds).toHaveBeenCalledTimes(2);
    expect(hiddenIds).toHaveBeenCalledWith(database, "viewer");
    expect(hiddenIds).toHaveBeenCalledWith(database, null);
    expect(hidden).toEqual(new Set(["private"]));
    expect(membersOnly).toEqual(new Set(["private", "members-community"]));
    expect(hiddenAgain).toBe(hidden);
    expect(membersOnlyAgain).toBe(membersOnly);
  });

  it("an anonymous reader's two sets are one query", async () => {
    const reader = createItemReader(database, null);
    const [hidden, membersOnly] = await Promise.all([
      reader.hiddenCommunityIds(),
      reader.membersOnlyCommunityIds(),
    ]);

    expect(hiddenIds).toHaveBeenCalledExactlyOnceWith(database, null);
    expect(hidden).toEqual(new Set(["private", "members-community"]));
    expect(membersOnly).toBe(hidden);
  });
});
