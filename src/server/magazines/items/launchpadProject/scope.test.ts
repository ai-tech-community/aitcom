import type { SQL } from "drizzle-orm";
import { drizzle, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Where } from "payload";
import { describe, expect, it, vi } from "vitest";

import { PICKER_LIMIT } from "@/lib/magazines/picker";
import type { Deps, PayloadClient } from "../../deps";
import { searchPickerCandidates } from "../pickers";
import { communityProjectFilter, communityProjectWhere } from "./scope";

const community = { id: "local", slug: "local" };
function database(ids: number[] = []) {
  const execute = vi.fn<RemoteCallback>(async () => ({
    rows: ids.map((id) => ({ id })),
  }));
  const memberships = vi.fn<
    (options: { where: SQL | undefined }) => Promise<{ userId: string }[]>
  >(async () => [{ userId: "active-member" }]);
  const client = drizzle(execute, { casing: "snake_case" });
  const executeRows = client.execute.bind(client);
  Object.assign(client, {
    // Neon returns a query result; pg-proxy returns its row array directly.
    execute: async (query: SQL) => ({ rows: await executeRows(query) }),
    query: { communityMemberships: { findMany: memberships } },
  });
  return {
    execute,
    memberships,
    deps: { db: client as unknown as Deps["db"] },
  };
}

function matches(where: Where, row: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === "and")
      return (condition as Where[]).every((part) => matches(part, row));
    if (field === "or")
      return (condition as Where[]).some((part) => matches(part, row));
    const operator = condition as {
      equals?: unknown;
      exists?: boolean;
      in?: unknown[];
    };
    if ("equals" in operator) return row[field] === operator.equals;
    if ("exists" in operator) return (row[field] != null) === operator.exists;
    if (operator.in) return operator.in.includes(row[field]);
    throw new Error(`Unexpected operator ${field}`);
  });
}

describe("community project scope", () => {
  it("keeps the SQL-backed picker scope and bounded validation scope aligned", async () => {
    const { deps, execute, memberships } = database([2]);
    const rows = [
      { id: 1, communityId: "local", authorId: "outsider" },
      { id: 2, communityId: null, authorId: "active-member" },
      { id: 3, communityId: null, authorId: "outsider" },
      { id: 4, communityId: "elsewhere", authorId: "active-member" },
      { id: 5, communityId: null, authorId: null },
    ];
    const where = await communityProjectWhere(
      deps,
      community,
      "",
      [],
      PICKER_LIMIT,
    );
    const accepts = await communityProjectFilter(deps, community, rows);
    expect(rows.map((row) => matches(where, row))).toEqual(rows.map(accepts));
    expect(rows.map(accepts)).toEqual([true, true, false, false, false]);
    const [querySql, params] = execute.mock.calls[0]!;
    const sql = querySql.replace(/\s+/g, " ");
    expect(sql).toContain('"launchpad_projects"."community_id" is null');
    expect(sql).toContain("exists (select");
    expect(sql).toContain(
      '"community_membership"."user_id" = "launchpad_projects"."author_id"',
    );
    expect(params).toEqual(["published", "local", "active", PICKER_LIMIT]);
    expect(memberships).toHaveBeenCalledTimes(1);
    const membershipQuery = new PgDialect({ casing: "snake_case" }).sqlToQuery(
      memberships.mock.calls[0]![0].where!,
    );
    expect(membershipQuery.params).toEqual([
      "local",
      "active",
      "active-member",
      "outsider",
    ]);
  });

  it("filters title and exclusions in SQL before limiting unscoped candidates", async () => {
    const { deps, execute } = database();
    await communityProjectWhere(deps, community, "50%", [7, 8], PICKER_LIMIT);
    const [querySql, params] = execute.mock.calls[0]!;
    const sql = querySql.replace(/\s+/g, " ");
    expect(sql).toContain('"launchpad_projects"."title" ilike');
    expect(sql).toContain('"launchpad_projects"."id" not in');
    expect(sql).toContain(
      'order by "launchpad_projects"."vote_count" desc limit',
    );
    expect(params).toEqual([
      "published",
      "local",
      "active",
      "%50\\%%",
      7,
      8,
      PICKER_LIMIT,
    ]);
  });

  it.each([
    { query: "agent eval", patterns: ["%agent%", "%eval%"] },
    {
      query: "  agent% \t eval_\\ \n ",
      patterns: ["%agent\\%%", "%eval\\_\\\\%"],
    },
  ])(
    "ANDs one escaped title predicate per word in '$query'",
    async ({ query, patterns }) => {
      const { deps, execute } = database();
      await communityProjectWhere(deps, community, query, [], PICKER_LIMIT);
      const [querySql, params] = execute.mock.calls[0]!;
      const sql = querySql.replace(/\s+/g, " ");
      expect(sql).toContain(
        'and "launchpad_projects"."title" ilike $4 and "launchpad_projects"."title" ilike $5',
      );
      expect(params).toEqual([
        "published",
        "local",
        "active",
        ...patterns,
        PICKER_LIMIT,
      ]);
    },
  );

  it("never loads active member ids in picker searches", async () => {
    const { deps, memberships } = database([2]);
    const find = vi.fn().mockResolvedValue({ docs: [] });
    await searchPickerCandidates(
      "launchpadProject",
      "",
      {
        deps: { ...deps, payload: { find } as unknown as PayloadClient },
        community,
        magazineId: 1,
        viewerId: "editor",
        locale: "en",
      },
      ["launchpadProject:7", "newsItem:other"],
    );
    expect(memberships).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        where: { and: expect.arrayContaining([{ id: { not_in: [7] } }]) },
        limit: PICKER_LIMIT,
      }),
    );
  });
});
