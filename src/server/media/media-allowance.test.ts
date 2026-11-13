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

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

/** Applies the subset of Payload `where` operators usageFor uses. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "and")
      return (condition as Where[]).every((w) => matches(row, w));
    if (key === "or")
      return (condition as Where[]).some((w) => matches(row, w));
    const value = row[key];
    const ops = condition as Record<string, unknown>;
    if ("equals" in ops) return value === ops.equals;
    if ("in" in ops) return (ops.in as unknown[]).includes(value);
    if ("greater_than" in ops) return String(value) > String(ops.greater_than);
    throw new Error(`fakePayload: unsupported condition on ${key}`);
  });
}

/** A Payload stand-in that filters in-memory rows by collection and `where`. */
function fakePayload(rows: Record<string, Row[]>) {
  return {
    find: async ({
      collection,
      where,
    }: {
      collection: string;
      where: Where;
    }) => {
      const docs = rows[collection];
      if (!docs) throw new Error(`fakePayload: no rows for ${collection}`);
      return { docs: docs.filter((row) => matches(row, where)) };
    },
  } as never;
}

describe("media allowance", () => {
  it("gives every community 5 GB of file storage today", async () => {
    expect(DEFAULT_MEDIA_ALLOWANCE).toEqual({ fileBytesStored: 5 * 1024 ** 3 });
    await expect(allowanceFor("c1")).resolves.toEqual({
      fileBytesStored: 5_368_709_120,
    });
  });

  it("asks hosted materials and gallery items for the same counted records", async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: [{ bytes: 1000 }, { bytes: 500 }] })
      .mockResolvedValueOnce({ docs: [{ bytes: 250 }] });
    await expect(usageFor({ find } as never, "c1", NOW)).resolves.toEqual({
      fileBytesStored: 1750,
    });
    const where = {
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
    };
    expect(find).toHaveBeenCalledTimes(2);
    expect(find).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where,
      select: { bytes: true },
      pagination: false,
      depth: 0,
    });
    expect(find).toHaveBeenCalledWith({
      collection: "gallery-items",
      where,
      select: { bytes: true },
      pagination: false,
      depth: 0,
    });
  });

  it("usageFor sums hosted materials and gallery items", async () => {
    const payload = fakePayload({
      "hosted-materials": [
        {
          communityId: "c1",
          status: "ready",
          bytes: 1000,
          createdAt: ago(86_400),
        },
        { communityId: "c2", status: "ready", bytes: 9999, createdAt: ago(60) },
      ],
      "gallery-items": [
        {
          communityId: "c1",
          status: "uploading",
          bytes: 500,
          createdAt: ago(60),
        },
        {
          communityId: "c1",
          status: "failed",
          bytes: 300,
          createdAt: ago(2 * 3600),
        },
      ],
    });
    await expect(usageFor(payload, "c1", NOW)).resolves.toEqual({
      fileBytesStored: 1500,
    });
  });

  it("counts a failed gallery item whose upload grant may still be live", async () => {
    const payload = fakePayload({
      "hosted-materials": [],
      "gallery-items": [
        {
          communityId: "c1",
          status: "failed",
          bytes: 300,
          createdAt: ago(5 * 60),
        },
      ],
    });
    await expect(usageFor(payload, "c1", NOW)).resolves.toEqual({
      fileBytesStored: 300,
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
    const payload = fakePayload({
      "hosted-materials": [],
      "gallery-items": [],
    });
    await expect(usageFor(payload, "c1")).resolves.toEqual({
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
