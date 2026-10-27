// @vitest-environment node
import { PgDialect } from "@payloadcms/db-postgres/drizzle/pg-core";
import { describe, expect, it, vi } from "vitest";

import type { Deps } from "./deps";
import { listIssueHistory, recordIssueHistory } from "./issue-history";
import type { PayloadTransaction } from "./payload-writes";

describe("issue history actor identity", () => {
  it.each([
    ["editor-1", "person"],
    [null, "automatic"],
  ] as const)("records %s as %s", async (actorId, actorKind) => {
    const execute = vi
      .fn<PayloadTransaction["execute"]>()
      .mockResolvedValue([]);
    await recordIssueHistory(
      { req: undefined, execute },
      {
        magazineId: 4,
        issue: { id: 7, number: 2, title: "Our news" },
        actorId,
        detail: { event: "published", origin: actorId ? "button" : "auto" },
      },
    );
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
    expect(query.sql).toContain('"actor_kind"');
    expect(query.params).toContain(actorKind);
    expect(query.sql).toContain("CURRENT_TIMESTAMP");
  });

  it("retains person identity when the member's name is gone", async () => {
    const row = {
      id: 1,
      detail: { event: "deleted" },
      actorKind: "person",
      actorName: null,
      issueId: null,
      issueNumber: 2,
      issueTitle: "Our news",
      issueStatus: null,
      createdAt: new Date("2026-10-27T12:00:00Z"),
    };
    const query = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([row]),
    };
    const db = {
      select: vi.fn().mockReturnValue(query),
    } as unknown as Deps["db"];
    expect(await listIssueHistory(db, 4)).toMatchObject([
      { actorKind: "person", actorName: null },
    ]);
  });
});
