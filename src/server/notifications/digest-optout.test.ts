import { beforeEach, describe, expect, it, vi } from "vitest";

const onConflictDoNothing = vi.hoisted(() => vi.fn());
const values = vi.hoisted(() => vi.fn(() => ({ onConflictDoNothing })));
const insert = vi.hoisted(() => vi.fn(() => ({ values })));

vi.mock("@/server/db", () => ({
  db: { insert },
}));

import { recordGlobalDigestOptOut } from "./digest-optout";

describe("recordGlobalDigestOptOut", () => {
  beforeEach(() => {
    insert.mockClear();
    values.mockClear();
    onConflictDoNothing.mockReset();
    onConflictDoNothing.mockResolvedValue(undefined);
  });

  it("inserts a global digest opt-out and ignores a duplicate", async () => {
    await recordGlobalDigestOptOut("user-1");

    expect(values).toHaveBeenCalledWith({
      userId: "user-1",
      communityId: null,
      category: "digest",
    });
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
  });
});
