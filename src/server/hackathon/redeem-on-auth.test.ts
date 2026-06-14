import { describe, it, expect, vi, beforeEach } from "vitest";

const { redeemSpy } = vi.hoisted(() => ({ redeemSpy: vi.fn() }));
vi.mock("@/server/db", () => ({ db: { __fake: true } }));
vi.mock("./redeem-staff-invites", () => ({
  redeemPendingStaffInvites: redeemSpy,
}));

import { redeemForCreatedUser, redeemAfterVerification } from "./redeem-on-auth";

beforeEach(() => redeemSpy.mockReset());

describe("redeemForCreatedUser", () => {
  it("skips redemption for an unverified new account", async () => {
    await redeemForCreatedUser({ id: "u1", email: "A@B.com", emailVerified: false });
    expect(redeemSpy).not.toHaveBeenCalled();
  });
  it("redeems with normalized email for a verified new account", async () => {
    await redeemForCreatedUser({ id: "u1", email: "  A@B.com ", emailVerified: true });
    expect(redeemSpy).toHaveBeenCalledTimes(1);
    expect(redeemSpy.mock.calls[0]?.[1]).toMatchObject({ userId: "u1", email: "a@b.com" });
  });
});

describe("redeemAfterVerification", () => {
  it("redeems with normalized email", async () => {
    await redeemAfterVerification({ id: "u2", email: "C@D.com" });
    expect(redeemSpy).toHaveBeenCalledTimes(1);
    expect(redeemSpy.mock.calls[0]?.[1]).toMatchObject({ userId: "u2", email: "c@d.com" });
  });
});
