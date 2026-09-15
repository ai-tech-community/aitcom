import { describe, expect, it } from "vitest";

import { AWESOME_AI_OSS_REVIEW_PATH } from "./awesome-ai-oss";
import {
  AIT_COMMUNITY_ROLES_JOIN_HREF,
  AIT_COMMUNITY_ROLES_PATH,
  AIT_COMMUNITY_ROLE_SEATS,
  HUB_DM_PATH,
  HUB_PEOPLE_PATH,
  HUB_WELCOME_THREAD_PATH,
  OUTREACH_APPROVED_AT,
  OUTREACH_TERM_ENDS_AT,
  SEAT_IDS,
  SEAT_TERM_DAYS,
  SEAT_TERM_WARNING_DAYS,
  daysLeftUntil,
  resolveSeat,
  resolveSeats,
  termEndsAtFromApprove,
  type SeatRecord,
} from "./ait-community-roles";

const SHIP_NOW = new Date(OUTREACH_APPROVED_AT);

describe("AIT Community roles seat map", () => {
  it("locks exactly four seats in Ops order", () => {
    expect(SEAT_IDS).toEqual([
      "hub-host",
      "awesome-oss-curator",
      "outreach-campus",
      "agent-pair-challenger",
    ]);
    expect(AIT_COMMUNITY_ROLE_SEATS.map((seat) => seat.id)).toEqual([
      ...SEAT_IDS,
    ]);
    expect(AIT_COMMUNITY_ROLE_SEATS).toHaveLength(4);
  });

  it("ships Hub host, curator, and challenger empty with no timer", () => {
    const seats = resolveSeats(AIT_COMMUNITY_ROLE_SEATS, SHIP_NOW);
    for (const id of [
      "hub-host",
      "awesome-oss-curator",
      "agent-pair-challenger",
    ] as const) {
      const seat = seats.find((row) => row.id === id);
      expect(seat).toMatchObject({
        id,
        empty: true,
        holderName: null,
        agentName: null,
        termEndsAt: null,
        daysLeft: null,
        urgent: false,
      });
    }
  });

  it("fills Outreach / campus with Reese Quinn only — no invented names", () => {
    const names = AIT_COMMUNITY_ROLE_SEATS.map(
      (seat) => seat.holderName,
    ).filter(Boolean);
    expect(names).toEqual(["Reese Quinn"]);

    const outreach = resolveSeat(
      AIT_COMMUNITY_ROLE_SEATS.find((seat) => seat.id === "outreach-campus")!,
      SHIP_NOW,
    );
    expect(outreach.empty).toBe(false);
    expect(outreach.holderName).toBe("Reese Quinn");
    expect(outreach.agentName).toBeNull();
    expect(outreach.termEndsAt).toBe(OUTREACH_TERM_ENDS_AT);
    expect(outreach.daysLeft).toBe(SEAT_TERM_DAYS);
    expect(outreach.urgent).toBe(false);
  });

  it("does not list Greg as a seat holder", () => {
    const blob = JSON.stringify(AIT_COMMUNITY_ROLE_SEATS);
    expect(blob).not.toMatch(/Greg/i);
    expect(
      AIT_COMMUNITY_ROLE_SEATS.some((seat) =>
        /Greg/i.test(seat.holderName ?? ""),
      ),
    ).toBe(false);
  });
});

describe("seat terms", () => {
  it("stores term_ends_at 90 days from Approve and never auto-extends", () => {
    expect(SEAT_TERM_DAYS).toBe(90);
    expect(termEndsAtFromApprove(OUTREACH_APPROVED_AT)).toBe(
      "2026-12-14T00:00:00.000Z",
    );
    expect(OUTREACH_TERM_ENDS_AT).toBe("2026-12-14T00:00:00.000Z");
    expect(daysLeftUntil(OUTREACH_TERM_ENDS_AT, SHIP_NOW)).toBe(90);

    const later = new Date("2026-10-15T00:00:00.000Z");
    expect(daysLeftUntil(OUTREACH_TERM_ENDS_AT, later)).toBe(60);
    expect(termEndsAtFromApprove(OUTREACH_APPROVED_AT)).toBe(
      OUTREACH_TERM_ENDS_AT,
    );
  });

  it("marks the countdown urgent at 14 days and not before", () => {
    expect(SEAT_TERM_WARNING_DAYS).toBe(14);
    const seat: SeatRecord = {
      id: "outreach-campus",
      holderName: "Reese Quinn",
      agentName: null,
      approvedAt: OUTREACH_APPROVED_AT,
      termEndsAt: OUTREACH_TERM_ENDS_AT,
    };

    const fifteen = resolveSeat(seat, new Date("2026-11-29T00:00:00.000Z"));
    expect(fifteen.daysLeft).toBe(15);
    expect(fifteen.urgent).toBe(false);
    expect(fifteen.empty).toBe(false);

    const fourteen = resolveSeat(seat, new Date("2026-11-30T00:00:00.000Z"));
    expect(fourteen.daysLeft).toBe(14);
    expect(fourteen.urgent).toBe(true);
    expect(fourteen.empty).toBe(false);
  });

  it("flips an expired seat to empty Claim state without inventing a name", () => {
    const seat: SeatRecord = {
      id: "outreach-campus",
      holderName: "Reese Quinn",
      agentName: null,
      approvedAt: OUTREACH_APPROVED_AT,
      termEndsAt: OUTREACH_TERM_ENDS_AT,
    };

    const expired = resolveSeat(seat, new Date(OUTREACH_TERM_ENDS_AT));
    expect(expired).toMatchObject({
      id: "outreach-campus",
      empty: true,
      holderName: null,
      agentName: null,
      termEndsAt: null,
      daysLeft: null,
      urgent: false,
    });
  });

  it("shares one term_ends_at for a human and agent on the same seat", () => {
    const seat: SeatRecord = {
      id: "hub-host",
      holderName: "Reese Quinn",
      agentName: "Reese-pair",
      approvedAt: OUTREACH_APPROVED_AT,
      termEndsAt: OUTREACH_TERM_ENDS_AT,
    };
    const view = resolveSeat(seat, SHIP_NOW);
    expect(view.empty).toBe(false);
    expect(view.holderName).toBe("Reese Quinn");
    expect(view.agentName).toBe("Reese-pair");
    expect(view.termEndsAt).toBe(OUTREACH_TERM_ENDS_AT);
    expect(view.daysLeft).toBe(SEAT_TERM_DAYS);
  });
});

describe("roles claim paths", () => {
  it("uses the hard www Join door and existing Welcome / Hub People paths", () => {
    expect(AIT_COMMUNITY_ROLES_PATH).toBe("/roles");
    expect(AIT_COMMUNITY_ROLES_JOIN_HREF).toBe(
      "https://www.aitcommunity.org/en/join",
    );
    expect(HUB_WELCOME_THREAD_PATH).toBe(
      "/communities/ait/forum/welcome-start-here-hub-join-guides-1788790840883",
    );
    expect(HUB_PEOPLE_PATH).toBe("/communities/ait/members");
    expect(HUB_DM_PATH).toBe("/messages");
    expect(AIT_COMMUNITY_ROLES_JOIN_HREF).not.toContain("/review");
    expect(HUB_WELCOME_THREAD_PATH).not.toBe(AWESOME_AI_OSS_REVIEW_PATH);
  });
});
