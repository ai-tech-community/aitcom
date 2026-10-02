// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));

const { agentPageReach } = await import("@/server/members/agent-profile");
const { REAL_SOREN_RAVN_USER_ID } = await import("@/lib/public-roster");

const publicProfile = { isPublic: true, hiddenByStaff: false };
const activeAgent = { id: "a1", status: "active" };

describe("agentPageReach", () => {
  it("is public for an active agent of a public member", () => {
    expect(
      agentPageReach({
        ownerId: "u1",
        profile: publicProfile,
        agent: activeAgent,
      }),
    ).toEqual({ kind: "public" });
  });

  it("follows the owner's profile reach first", () => {
    expect(
      agentPageReach({
        ownerId: "u1",
        profile: { isPublic: false, hiddenByStaff: false },
        agent: activeAgent,
      }),
    ).toEqual({ kind: "ownerOnly", reason: "private" });
    expect(
      agentPageReach({
        ownerId: "u1",
        profile: { isPublic: true, hiddenByStaff: true },
        agent: activeAgent,
      }),
    ).toEqual({ kind: "ownerOnly", reason: "hiddenByStaff" });
    expect(
      agentPageReach({ ownerId: "u1", profile: null, agent: activeAgent }),
    ).toEqual({ kind: "ownerOnly", reason: "private" });
  });

  it("keeps a non-active agent owner-only and names its status", () => {
    for (const status of ["inactive", "disabled", "unclaimed", "pending"]) {
      expect(
        agentPageReach({
          ownerId: "u1",
          profile: publicProfile,
          agent: { id: "a1", status },
        }),
      ).toEqual({
        kind: "ownerOnly",
        reason: "agentNotActive",
        agentStatus: status,
      });
    }
  });

  it("applies the roster's no-agent override", () => {
    expect(
      agentPageReach({
        ownerId: REAL_SOREN_RAVN_USER_ID,
        profile: publicProfile,
        agent: activeAgent,
      }),
    ).toEqual({ kind: "ownerOnly", reason: "hiddenByStaff" });
  });
});
