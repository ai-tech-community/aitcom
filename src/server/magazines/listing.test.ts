import { describe, expect, it, vi } from "vitest";

import type { PayloadClient } from "./deps";
import { hiddenMagazineIds, isHiddenByStaff } from "./listing";

describe("staff-hidden magazines", () => {
  it("only an explicit staff switch hides a magazine", () => {
    expect(isHiddenByStaff({ listingHidden: true })).toBe(true);
    for (const listingHidden of [false, null, undefined]) {
      expect(isHiddenByStaff({ listingHidden })).toBe(false);
    }
  });

  it("loads every hidden magazine id as a number", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ id: "7" }, { id: 12 }] });
    expect(
      await hiddenMagazineIds({ find } as unknown as Pick<
        PayloadClient,
        "find"
      >),
    ).toEqual([7, 12]);
    expect(find).toHaveBeenCalledWith({
      collection: "magazines",
      where: { listingHidden: { equals: true } },
      pagination: false,
      depth: 0,
      select: {},
    });
  });

  it("returns no ids when staff hid no magazines", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] });
    expect(
      await hiddenMagazineIds({ find } as unknown as Pick<
        PayloadClient,
        "find"
      >),
    ).toEqual([]);
  });
});
