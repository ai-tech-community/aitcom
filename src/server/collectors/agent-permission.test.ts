import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  collectorAgentAccess,
  setCollectorAgentAccess,
} from "./agent-permission";
function fixture(keys: { id: string; scopes: string[] }[]) {
  const selection = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    for: vi
      .fn()
      .mockResolvedValueOnce([{ id: "agent" }])
      .mockResolvedValue(keys),
  };
  const update = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn<(where: SQL) => Promise<void>>().mockResolvedValue(undefined),
  };
  const tx = { select: () => selection, update: vi.fn(() => update) };
  return {
    db: { transaction: async (fn: (v: unknown) => unknown) => fn(tx) } as never,
    selection,
    update,
    tx,
  };
}
describe("owner-granted collect permission", () => {
  it("adds and revokes only collect on existing owner-bound keys, preserving other permissions", async () => {
    const grant = fixture([
      { id: "key", scopes: ["read", "contribute", "collect", "collect"] },
    ]);
    expect(await setCollectorAgentAccess(grant.db, "owner", true)).toBe(true);
    expect(grant.update.set).toHaveBeenCalledWith({
      scopes: ["read", "contribute", "collect"],
    });
    const revoke = fixture([{ id: "key", scopes: ["read", "collect"] }]);
    await setCollectorAgentAccess(revoke.db, "owner", false);
    expect(revoke.update.set).toHaveBeenCalledWith({ scopes: ["read"] });
    const sql = new PgDialect().sqlToQuery(
      grant.update.where.mock.calls[0]![0],
    );
    expect(sql.params).toContain("owner");
    expect(sql.params).toContain("key");
    expect(sql.params).toContain(true);
  });
  it("does not create credentials when the owner has no active agent/key", async () => {
    const f = fixture([]);
    f.selection.for.mockReset().mockResolvedValue([]);
    expect(await setCollectorAgentAccess(f.db, "owner", true)).toBe(false);
    expect(f.tx.update).not.toHaveBeenCalled();
  });
  it("reports permission for only active keys bound to the current owner and agent", async () => {
    const builder = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi
        .fn<(where: SQL) => Promise<{ scopes: string[] }[]>>()
        .mockResolvedValue([
          { scopes: ["read", "collect"] },
          { scopes: ["read"] },
        ]),
    };
    expect(
      await collectorAgentAccess({ select: () => builder } as never, "owner"),
    ).toEqual({ hasKey: true, allowed: true });
    const sql = new PgDialect().sqlToQuery(builder.where.mock.calls[0]![0]);
    expect(sql.params.filter((v) => v === "owner")).toHaveLength(2);
    expect(sql.params).toContain("active");
  });
});
