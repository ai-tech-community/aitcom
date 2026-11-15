import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

import type * as VisibilityQueries from "@/server/communities/content-visibility-queries";

const seam = vi.hoisted(() => ({ memberOf: vi.fn() }));
vi.mock(
  "@/server/communities/content-visibility-queries",
  async (importOriginal) => ({
    ...(await importOriginal<typeof VisibilityQueries>()),
    activeMemberCommunityIds: seam.memberOf,
  }),
);

import { countInboxUnread } from "./unread-count";

/** A db whose one select captures the FROM subquery and answers `total`. */
function fakeDb() {
  const captured: SQL[] = [];
  const db = {
    select: () => ({
      from: (sub: SQL) => {
        captured.push(sub);
        return Promise.resolve([{ total: 2 }]);
      },
    }),
  };
  return { db: db as never, captured };
}

describe("countInboxUnread", () => {
  it("counts a room only in communities where the member is in good standing", async () => {
    // The seam's member set leaves out a lapsed paid membership, so its
    // rooms count nothing, as listConversations shows nothing for them.
    seam.memberOf.mockResolvedValue(new Set(["c-good"]));
    const { db, captured } = fakeDb();
    await expect(countInboxUnread(db, "u1")).resolves.toBe(2);
    expect(seam.memberOf).toHaveBeenCalledWith(db, "u1");
    const { sql, params } = new PgDialect().sqlToQuery(captured[0]!);
    expect(params).toContain("c-good");
    expect(sql).toMatch(/"communityId" in \(/i);
  });

  it("counts no room at all without a community in good standing", async () => {
    seam.memberOf.mockResolvedValue(new Set());
    const { db, captured } = fakeDb();
    await countInboxUnread(db, "u1");
    const { sql } = new PgDialect().sqlToQuery(captured[0]!);
    expect(sql).toMatch(/and false/i);
  });
});
