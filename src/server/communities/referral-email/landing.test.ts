// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadInviteLanding } from "./landing";
const now = new Date("2026-11-01T10:00:00Z");
const grant = {
  code: "code",
  role: null,
  expiresAt: null,
  maxUses: null,
  useCount: 0,
  communityId: "community",
  communityName: "AIT",
  communitySlug: "ait",
  inviterName: "Maya",
};
function dbWith(reads: unknown[][]) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => reads.shift() ?? [],
  };
  return { select: vi.fn(() => chain) };
}
describe("guest invite presentation without weakening redemption", () => {
  it("returns only presentation fields for a valid secret grant", async () => {
    const result = await loadInviteLanding(
      dbWith([[grant]]) as never,
      "code",
      undefined,
      now,
    );
    expect(result).toMatchObject({
      kind: "valid",
      inviterName: "Maya",
      communityName: "AIT",
    });
    expect(result).not.toHaveProperty("role");
    expect(result).not.toHaveProperty("targetEmail");
    expect(result).not.toHaveProperty("code");
  });
  it("withholds names from expired grants", async () => {
    expect(
      await loadInviteLanding(
        dbWith([[{ ...grant, expiresAt: new Date("2026-10-01") }]]) as never,
        "code",
        undefined,
        now,
      ),
    ).toEqual({ kind: "expired" });
  });
  it("lets an existing member revisit an exhausted single-use role link", async () => {
    const db = dbWith([
      [{ ...grant, role: "admin", maxUses: 1, useCount: 1 }],
      [{ status: "active", role: "admin" }],
    ]);
    expect(
      await loadInviteLanding(db as never, "code", "member", now),
    ).toMatchObject({ kind: "valid", alreadyMember: true });
  });
  it("still rejects an exhausted grant when a role upgrade would consume a use", async () => {
    const db = dbWith([
      [{ ...grant, role: "admin", maxUses: 1, useCount: 1 }],
      [{ status: "active", role: "member" }],
    ]);
    expect(await loadInviteLanding(db as never, "code", "member", now)).toEqual(
      { kind: "expired" },
    );
  });
  it("never bypasses redemption for a member who is being promoted", async () => {
    const db = dbWith([
      [{ ...grant, role: "admin" }],
      [{ status: "active", role: "member" }],
    ]);
    expect(
      await loadInviteLanding(db as never, "code", "member", now),
    ).toMatchObject({ kind: "valid", alreadyMember: false });
  });
  it("keeps standing non-directory slug links usable", async () => {
    expect(
      await loadInviteLanding(
        dbWith([[], [{ name: "Unlisted group", slug: "unlisted" }]]) as never,
        "unlisted",
        undefined,
        now,
      ),
    ).toMatchObject({
      kind: "valid",
      communitySlug: "unlisted",
      inviterName: null,
    });
  });
});
