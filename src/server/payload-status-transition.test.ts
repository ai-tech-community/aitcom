import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { transitionStatus } from "./payload-status-transition";

function fakePayload(rows: unknown[]) {
  const execute = vi.fn(async (_query: SQL) => ({ rows }));
  return { payload: { db: { drizzle: { execute } } } as never, execute };
}

/** The statement sent, whitespace collapsed, with its values. */
function sent(execute: ReturnType<typeof fakePayload>["execute"]) {
  const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
  return { sql: query.sql.replace(/\s+/g, " ").trim(), params: query.params };
}

describe("transitionStatus", () => {
  it("moves the row in one statement guarded on its current status", async () => {
    const { payload, execute } = fakePayload([{ id: 3 }]);
    await expect(
      transitionStatus(payload, {
        collection: "gallery-batches",
        id: 3,
        from: "open",
        to: "finished",
      }),
    ).resolves.toBe(true);
    expect(sent(execute)).toEqual({
      sql: 'UPDATE "gallery_batches" SET "status" = $1, "updated_at" = now() WHERE "id" = $2 AND "status" = $3 RETURNING "id"',
      params: ["finished", 3, "open"],
    });
  });

  it("sets the failure reason alongside the status", async () => {
    const { payload, execute } = fakePayload([{ id: 7 }]);
    await transitionStatus(payload, {
      collection: "gallery-items",
      id: 7,
      from: "uploading",
      to: "failed",
      set: { failureReason: "cancelled" },
    });
    expect(sent(execute)).toEqual({
      sql: 'UPDATE "gallery_items" SET "status" = $1, "failure_reason" = $2, "updated_at" = now() WHERE "id" = $3 AND "status" = $4 RETURNING "id"',
      params: ["failed", "cancelled", 7, "uploading"],
    });
  });

  it("writes classroom files to their own table", async () => {
    const { payload, execute } = fakePayload([{ id: 9 }]);
    await transitionStatus(payload, {
      collection: "hosted-materials",
      id: 9,
      from: "uploading",
      to: "ready",
    });
    expect(sent(execute).sql).toContain('UPDATE "hosted_materials"');
  });

  it("reports a loss when the row had already left the status", async () => {
    const { payload } = fakePayload([]);
    await expect(
      transitionStatus(payload, {
        collection: "gallery-items",
        id: 7,
        from: "uploading",
        to: "ready",
      }),
    ).resolves.toBe(false);
  });
});
