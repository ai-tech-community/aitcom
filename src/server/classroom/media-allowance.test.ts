import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MEDIA_ALLOWANCE,
  allowanceFor,
  exceedsAllowance,
  usageFor,
} from "./media-allowance";

describe("media allowance", () => {
  it("gives every community 5 GB of file storage today", async () => {
    expect(DEFAULT_MEDIA_ALLOWANCE).toEqual({ fileBytesStored: 5 * 1024 ** 3 });
    await expect(allowanceFor("c1")).resolves.toEqual({
      fileBytesStored: 5_368_709_120,
    });
  });

  it("sums the bytes of one community's uploading and ready files", async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [{ bytes: 1000 }, { bytes: 500 }],
    });
    await expect(usageFor({ find } as never, "c1")).resolves.toEqual({
      fileBytesStored: 1500,
    });
    expect(find).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where: {
        and: [
          { communityId: { equals: "c1" } },
          { status: { in: ["uploading", "ready"] } },
        ],
      },
      pagination: false,
      depth: 0,
    });
  });

  it("reports no usage for a community without files", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] });
    await expect(usageFor({ find } as never, "c1")).resolves.toEqual({
      fileBytesStored: 0,
    });
  });

  it("refuses only what would go past the allowance", () => {
    const allowance = { fileBytesStored: 1000 };
    expect(exceedsAllowance({ fileBytesStored: 900 }, allowance, 100)).toBe(
      false,
    );
    expect(exceedsAllowance({ fileBytesStored: 900 }, allowance, 101)).toBe(
      true,
    );
    expect(exceedsAllowance({ fileBytesStored: 1200 }, allowance, 0)).toBe(
      true,
    );
  });
});
