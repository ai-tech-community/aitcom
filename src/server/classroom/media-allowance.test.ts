import { describe, expect, it, vi } from "vitest";

import { UPLOAD_GRANT_SECONDS } from "@/lib/video-rules";

import {
  DEFAULT_MEDIA_ALLOWANCE,
  UPLOAD_GRANT_LIVE_SECONDS,
  allowanceFor,
  exceedsAllowance,
  mayUploadGrantBeLive,
  usageFor,
} from "./media-allowance";

const NOW = new Date("2026-09-28T12:00:00.000Z");
const ago = (seconds: number) =>
  new Date(NOW.getTime() - seconds * 1000).toISOString();

describe("media allowance", () => {
  it("gives every community 5 GB of file storage today", async () => {
    expect(DEFAULT_MEDIA_ALLOWANCE).toEqual({ fileBytesStored: 5 * 1024 ** 3 });
    await expect(allowanceFor("c1")).resolves.toEqual({
      fileBytesStored: 5_368_709_120,
    });
  });

  it("sums one community's uploading and ready files, and failed ones whose upload grant may still be live", async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [{ bytes: 1000 }, { bytes: 500 }],
    });
    await expect(usageFor({ find } as never, "c1", NOW)).resolves.toEqual({
      fileBytesStored: 1500,
    });
    expect(find).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where: {
        and: [
          { communityId: { equals: "c1" } },
          {
            or: [
              { status: { in: ["uploading", "ready"] } },
              {
                and: [
                  { status: { equals: "failed" } },
                  {
                    createdAt: {
                      greater_than: ago(UPLOAD_GRANT_LIVE_SECONDS),
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      pagination: false,
      depth: 0,
    });
  });

  it("treats a grant as possibly live a little past its lifetime, to cover the time between record and grant", () => {
    expect(UPLOAD_GRANT_LIVE_SECONDS).toBeGreaterThan(UPLOAD_GRANT_SECONDS);
    expect(mayUploadGrantBeLive(ago(UPLOAD_GRANT_SECONDS), NOW)).toBe(true);
    expect(mayUploadGrantBeLive(ago(UPLOAD_GRANT_LIVE_SECONDS - 1), NOW)).toBe(
      true,
    );
    expect(mayUploadGrantBeLive(ago(UPLOAD_GRANT_LIVE_SECONDS), NOW)).toBe(
      false,
    );
    expect(mayUploadGrantBeLive(ago(86_400), NOW)).toBe(false);
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
