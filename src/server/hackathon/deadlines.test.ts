// src/server/hackathon/deadlines.test.ts
import { describe, it, expect } from "vitest";

import {
  isRegistrationOpen,
  isSubmissionOpen,
  isJudgingOpen,
  deadlineOrderWarnings,
  type EventDeadlines,
} from "./deadlines";

function ev(overrides: Partial<EventDeadlines> = {}): EventDeadlines {
  return {
    registrationDeadline: null,
    submissionDeadline: null,
    judgingDeadline: null,
    resultsDate: null,
    ...overrides,
  };
}

const NOW = new Date("2026-06-14T12:00:00.000Z");

describe("isRegistrationOpen", () => {
  it("is open when the deadline is unset (today's phase-driven behavior)", () => {
    const r = isRegistrationOpen(ev(), NOW);
    expect(r).toEqual({ open: true, deadline: null, reason: null });
  });

  it("is open strictly before the deadline", () => {
    const r = isRegistrationOpen(
      ev({ registrationDeadline: "2026-06-14T13:00:00.000Z" }),
      NOW,
    );
    expect(r.open).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("is open exactly at the deadline (now <= deadline)", () => {
    const r = isRegistrationOpen(
      ev({ registrationDeadline: "2026-06-14T12:00:00.000Z" }),
      NOW,
    );
    expect(r.open).toBe(true);
  });

  it("is closed after the deadline, with a stable reason", () => {
    const r = isRegistrationOpen(
      ev({ registrationDeadline: "2026-06-14T11:00:00.000Z" }),
      NOW,
    );
    expect(r.open).toBe(false);
    expect(r.reason).toBe("registration_closed");
    expect(r.deadline).toEqual(new Date("2026-06-14T11:00:00.000Z"));
  });

  it("accepts a Date instance as well as an ISO string", () => {
    const r = isRegistrationOpen(
      ev({ registrationDeadline: new Date("2026-06-14T11:00:00.000Z") }),
      NOW,
    );
    expect(r.open).toBe(false);
  });

  it("treats an unparseable deadline string as unset (open)", () => {
    const r = isRegistrationOpen(ev({ registrationDeadline: "not-a-date" }), NOW);
    expect(r).toEqual({ open: true, deadline: null, reason: null });
  });
});

describe("isSubmissionOpen", () => {
  it("uses the submission deadline and its own reason", () => {
    const r = isSubmissionOpen(
      ev({ submissionDeadline: "2026-06-14T11:00:00.000Z" }),
      NOW,
    );
    expect(r.open).toBe(false);
    expect(r.reason).toBe("submission_closed");
  });
});

describe("isJudgingOpen", () => {
  it("uses the judging deadline and its own reason", () => {
    const r = isJudgingOpen(
      ev({ judgingDeadline: "2026-06-14T11:00:00.000Z" }),
      NOW,
    );
    expect(r.open).toBe(false);
    expect(r.reason).toBe("judging_closed");
  });
});

describe("deadlineOrderWarnings", () => {
  it("returns no warnings when all unset", () => {
    expect(deadlineOrderWarnings(ev())).toEqual([]);
  });

  it("returns no warnings when chronological", () => {
    expect(
      deadlineOrderWarnings(
        ev({
          registrationDeadline: "2026-06-14T10:00:00.000Z",
          submissionDeadline: "2026-06-14T11:00:00.000Z",
          judgingDeadline: "2026-06-14T12:00:00.000Z",
        }),
      ),
    ).toEqual([]);
  });

  it("warns when submission precedes registration", () => {
    const warnings = deadlineOrderWarnings(
      ev({
        registrationDeadline: "2026-06-14T11:00:00.000Z",
        submissionDeadline: "2026-06-14T10:00:00.000Z",
      }),
    );
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/submission/i);
  });

  it("warns when judging precedes submission", () => {
    const warnings = deadlineOrderWarnings(
      ev({
        submissionDeadline: "2026-06-14T12:00:00.000Z",
        judgingDeadline: "2026-06-14T11:00:00.000Z",
      }),
    );
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/judging/i);
  });

  it("warns when results precede judging", () => {
    const warnings = deadlineOrderWarnings(
      ev({
        judgingDeadline: "2026-06-14T12:00:00.000Z",
        resultsDate: "2026-06-14T11:00:00.000Z",
      }),
    );
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/results/i);
  });

  it("returns both warnings when both pairs are out of order", () => {
    const warnings = deadlineOrderWarnings(
      ev({
        registrationDeadline: "2026-06-14T13:00:00.000Z",
        submissionDeadline: "2026-06-14T12:00:00.000Z",
        judgingDeadline: "2026-06-14T11:00:00.000Z",
      }),
    );
    expect(warnings).toHaveLength(2);
  });

  it("warns across an unset middle deadline (sparse chain)", () => {
    const warnings = deadlineOrderWarnings(
      ev({
        registrationDeadline: "2026-06-14T12:00:00.000Z",
        // submission unset
        judgingDeadline: "2026-06-14T10:00:00.000Z",
      }),
    );
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/judging/i);
  });
});
