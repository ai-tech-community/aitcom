import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
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

/** A Payload stand-in whose adapter answers the usage query with `rows`. */
function fakePayload(rows: unknown[]) {
  const execute = vi.fn(async (_query: SQL) => ({ rows }));
  return { payload: { db: { drizzle: { execute } } } as never, execute };
}

/** The statement sent, whitespace collapsed, with its values. */
function sent(execute: ReturnType<typeof fakePayload>["execute"]) {
  const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
  return { sql: query.sql.replace(/\s+/g, " ").trim(), params: query.params };
}

describe("media allowance", () => {
  it("gives every community 5 GB of file storage today", async () => {
    expect(DEFAULT_MEDIA_ALLOWANCE).toEqual({ fileBytesStored: 5 * 1024 ** 3 });
    await expect(allowanceFor("c1")).resolves.toEqual({
      fileBytesStored: 5_368_709_120,
    });
  });

  it("sums hosted materials and gallery items in the database, in one statement", async () => {
    const { payload, execute } = fakePayload([{ bytes: "1750" }]);
    await expect(usageFor(payload, "c1", NOW)).resolves.toEqual({
      fileBytesStored: 1750,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    const counted =
      '"community_id" = $? AND ("status" IN ($?, $?) OR ("status" = $? AND "created_at" > $?))';
    const { sql, params } = sent(execute);
    expect(sql.replace(/\$\d+/g, "$?")).toBe(
      'SELECT COALESCE(SUM("bytes"), 0) AS "bytes" FROM (' +
        `SELECT "bytes" FROM "hosted_materials" WHERE ${counted} UNION ALL ` +
        `SELECT "bytes" FROM "gallery_items" WHERE ${counted}` +
        ') AS "counted"',
    );
    const perTable = [
      "c1",
      "uploading",
      "ready",
      "failed",
      ago(UPLOAD_GRANT_LIVE_SECONDS),
    ];
    expect(params).toEqual([...perTable, ...perTable]);
  });

  it("reports no usage for a community without files", async () => {
    const { payload } = fakePayload([{ bytes: "0" }]);
    await expect(usageFor(payload, "c1")).resolves.toEqual({
      fileBytesStored: 0,
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
