// src/server/moderation/report-rules.test.ts
import { PgDialect } from "drizzle-orm/pg-core";
import { ValidationError } from "payload";
import { describe, expect, it, vi } from "vitest";

import {
  communityModeratorIds,
  countOpenReports,
  isDuplicateReportError,
  openReportsWhere,
  REPORT_TARGET_FIELD,
  RESTORE_PATCH,
} from "./report-rules";

describe("REPORT_TARGET_FIELD", () => {
  it("names each report collection's link to what it reports", () => {
    expect(REPORT_TARGET_FIELD).toEqual({
      "post-reports": "post",
      "gallery-reports": "item",
    });
    expect(Object.isFrozen(REPORT_TARGET_FIELD)).toBe(true);
  });
});

describe("openReportsWhere", () => {
  it("matches the target's reports a moderator hasn't dismissed", () => {
    expect(openReportsWhere("post-reports", 5)).toEqual({
      and: [{ post: { equals: 5 } }, { dismissedAt: { exists: false } }],
    });
    expect(openReportsWhere("gallery-reports", 7)).toEqual({
      and: [{ item: { equals: 7 } }, { dismissedAt: { exists: false } }],
    });
  });
});

describe("isDuplicateReportError", () => {
  const uniqueViolation = (collection: string) =>
    new ValidationError({
      collection,
      errors: [{ message: "Value must be unique", path: "reporterId" }],
    });

  it("is true only for a validation error from the same report collection", () => {
    expect(
      isDuplicateReportError(uniqueViolation("post-reports"), "post-reports"),
    ).toBe(true);
    expect(
      isDuplicateReportError(
        uniqueViolation("gallery-reports"),
        "gallery-reports",
      ),
    ).toBe(true);
    expect(
      isDuplicateReportError(
        uniqueViolation("post-reports"),
        "gallery-reports",
      ),
    ).toBe(false);
  });

  it("is false for anything that isn't a validation error", () => {
    expect(isDuplicateReportError(new Error("boom"), "post-reports")).toBe(
      false,
    );
    expect(isDuplicateReportError(undefined, "post-reports")).toBe(false);
    expect(
      isDuplicateReportError(
        { data: { collection: "post-reports" } },
        "post-reports",
      ),
    ).toBe(false);
  });
});

describe("RESTORE_PATCH", () => {
  it("unhides and resets the count", () => {
    expect(RESTORE_PATCH).toEqual({ hiddenAt: null, reportCount: 0 });
  });

  it("cannot be changed by a caller", () => {
    expect(Object.isFrozen(RESTORE_PATCH)).toBe(true);
  });
});

describe("countOpenReports", () => {
  it("counts the stored open reports of one target", async () => {
    const payload = { count: vi.fn().mockResolvedValue({ totalDocs: 3 }) };
    await expect(
      countOpenReports(payload as never, "gallery-reports", 7),
    ).resolves.toBe(3);
    expect(payload.count).toHaveBeenCalledWith({
      collection: "gallery-reports",
      where: {
        and: [{ item: { equals: 7 } }, { dismissedAt: { exists: false } }],
      },
    });
  });
});

describe("communityModeratorIds", () => {
  function fakeDb(rows: Array<{ userId: string }>) {
    const captured: { where?: unknown; columns?: unknown } = {};
    const db = {
      select: (columns: unknown) => {
        captured.columns = columns;
        return {
          from: () => ({
            where: async (condition: unknown) => {
              captured.where = condition;
              return rows;
            },
          }),
        };
      },
    };
    return { db, captured };
  }

  it("returns the user ids of the community's active owners, admins and moderators", async () => {
    const { db, captured } = fakeDb([{ userId: "u1" }, { userId: "u2" }]);
    await expect(communityModeratorIds(db as never, "c-1")).resolves.toEqual([
      "u1",
      "u2",
    ]);
    const query = new PgDialect().sqlToQuery(captured.where as never);
    expect(query.sql).toBe(
      '("app"."community_membership"."communityId" = $1 and "app"."community_membership"."status" = $2 and "app"."community_membership"."role" in ($3, $4, $5))',
    );
    expect(query.params).toEqual([
      "c-1",
      "active",
      "owner",
      "admin",
      "moderator",
    ]);
  });

  it("returns an empty list when nobody moderates", async () => {
    const { db } = fakeDb([]);
    await expect(communityModeratorIds(db as never, "c-1")).resolves.toEqual(
      [],
    );
  });
});
