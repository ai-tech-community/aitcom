import { describe, it, expect } from "vitest";
import {
  viewerJoinAction,
  slugJoinStatus,
  roleFromInvite,
  canRedeemInvite,
} from "./invite-policy";

describe("slugJoinStatus", () => {
  it("open communities join as active", () => {
    expect(slugJoinStatus("open")).toEqual({ ok: true, status: "active" });
  });
  it("approval_required communities join as pending_approval", () => {
    expect(slugJoinStatus("approval_required")).toEqual({
      ok: true,
      status: "pending_approval",
    });
  });
  it("invite_only communities refuse slug joins", () => {
    expect(slugJoinStatus("invite_only")).toEqual({
      ok: false,
      reason: "invite_only",
    });
  });
});

describe("roleFromInvite", () => {
  it("defaults null/undefined to member", () => {
    expect(roleFromInvite(null)).toBe("member");
    expect(roleFromInvite(undefined)).toBe("member");
  });
  it("returns the stored role when set", () => {
    expect(roleFromInvite("moderator")).toBe("moderator");
    expect(roleFromInvite("admin")).toBe("admin");
  });
});

describe("canRedeemInvite", () => {
  it("anyone may redeem an unbound invite (null targetEmail)", () => {
    expect(canRedeemInvite(null, "anyone@example.com")).toBe(true);
  });
  it("matches the bound email case- and whitespace-insensitively", () => {
    expect(canRedeemInvite("Person@Example.com", " person@example.com ")).toBe(
      true,
    );
  });
  it("rejects a mismatched email", () => {
    expect(canRedeemInvite("a@example.com", "b@example.com")).toBe(false);
  });
  it("rejects when the user has no email but the invite is bound", () => {
    expect(canRedeemInvite("a@example.com", null)).toBe(false);
  });
});

describe("viewerJoinAction", () => {
  it("offers join, request or nothing by policy to a non-member", () => {
    expect(viewerJoinAction({ joinPolicy: "open", status: null })).toEqual({
      kind: "join",
    });
    expect(
      viewerJoinAction({ joinPolicy: "approval_required", status: null }),
    ).toEqual({ kind: "request" });
    expect(
      viewerJoinAction({ joinPolicy: "invite_only", status: null }),
    ).toEqual({ kind: "invite_only" });
  });

  it("offers an open invitation to accept or decline, whatever the policy", () => {
    for (const joinPolicy of [
      "open",
      "approval_required",
      "invite_only",
    ] as const) {
      expect(viewerJoinAction({ joinPolicy, status: "invited" })).toEqual({
        kind: "invited",
      });
    }
  });

  it("shows a pending request as pending, whatever the policy", () => {
    expect(
      viewerJoinAction({ joinPolicy: "open", status: "pending_approval" }),
    ).toEqual({ kind: "pending" });
  });

  it("lets members leave, except owners and Hub members", () => {
    expect(
      viewerJoinAction({
        joinPolicy: "open",
        status: "active",
        role: "member",
      }),
    ).toEqual({ kind: "member", canLeave: true });
    expect(
      viewerJoinAction({ joinPolicy: "open", status: "active", role: "owner" }),
    ).toEqual({ kind: "member", canLeave: false });
    expect(
      viewerJoinAction({
        joinPolicy: "open",
        status: "active",
        role: "member",
        isHub: true,
      }),
    ).toEqual({ kind: "member", canLeave: false });
  });

  it("offers nothing to a banned visitor", () => {
    expect(viewerJoinAction({ joinPolicy: "open", status: "banned" })).toEqual({
      kind: "unavailable",
    });
  });
});
