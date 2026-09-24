import { beforeEach, describe, expect, it, vi } from "vitest";

const find = vi.hoisted(() => vi.fn(async (_args: unknown) => ({ docs: [] })));
const hidden = vi.hoisted(() => vi.fn(async () => [] as string[]));

vi.mock("@/server/payload", () => ({
  getPayloadClient: vi.fn(async () => ({ find })),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/communities/content-visibility-queries", () => ({
  hiddenContentCommunityIds: hidden,
}));

import { detectCommunitySignals } from "./signals";

function whereFor(collection: string): unknown {
  const call = find.mock.calls.find(
    ([args]) => (args as { collection: string }).collection === collection,
  );
  return (call?.[0] as { where?: unknown } | undefined)?.where;
}

describe("detectCommunitySignals", () => {
  beforeEach(() => {
    find.mockClear();
    hidden.mockReset();
  });

  it("reads only what a signed-out visitor could read", async () => {
    hidden.mockResolvedValue(["unlisted-id"]);

    await detectCommunitySignals(14);

    expect(hidden).toHaveBeenCalledWith({}, null);
    const readable = {
      or: [
        { communityId: { exists: false } },
        { communityId: { not_in: ["unlisted-id"] } },
      ],
    };
    expect(whereFor("forum-threads")).toEqual({
      and: [
        { createdAt: { greater_than_equal: expect.any(String) } },
        readable,
      ],
    });
    expect(whereFor("community-ideas")).toEqual({
      and: [{ status: { equals: "open" } }, readable],
    });
  });

  it("adds no condition when every community is public", async () => {
    hidden.mockResolvedValue([]);

    await detectCommunitySignals(14);

    expect(whereFor("community-ideas")).toEqual({
      status: { equals: "open" },
    });
  });
});
