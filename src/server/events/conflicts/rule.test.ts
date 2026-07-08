import { describe, expect, it } from "vitest";

import {
  CONFLICT_GRADE_ORDER,
  evaluateConflict,
  type ConflictCandidate,
  type CorpusEvent,
} from "./rule";

const AMSTERDAM = "Europe/Amsterdam";
const LONDON = "Europe/London";
const TOKYO = "Asia/Tokyo";

// Amsterdam coordinates, reused across several catchment cases.
const AMSTERDAM_COORDS = { latitude: 52.3676, longitude: 4.9041 };
// ~36km from Amsterdam — inside the 50km catchment radius.
const UTRECHT_COORDS = { latitude: 52.0907, longitude: 5.1214 };
// Far outside the 50km catchment radius.
const PARIS_COORDS = { latitude: 48.8566, longitude: 2.3522 };

function makeCandidate(
  overrides: Partial<ConflictCandidate> = {},
): ConflictCandidate {
  return {
    date: "2026-07-15",
    startTime: "18:00",
    endTime: "20:00",
    timezone: AMSTERDAM,
    format: "in-person",
    city: "Amsterdam",
    latitude: AMSTERDAM_COORDS.latitude,
    longitude: AMSTERDAM_COORDS.longitude,
    audienceIds: [1],
    ...overrides,
  };
}

function makeEvent(overrides: Partial<CorpusEvent> = {}): CorpusEvent {
  return {
    id: 100,
    title: "Test Event",
    date: "2026-07-15",
    startTime: "18:00",
    endTime: "20:00",
    timezone: AMSTERDAM,
    format: "in-person",
    city: "Amsterdam",
    latitude: AMSTERDAM_COORDS.latitude,
    longitude: AMSTERDAM_COORDS.longitude,
    audienceIds: [1],
    tentative: false,
    sourceUrl: null,
    communityId: null,
    ...overrides,
  };
}

const NO_RELATED = new Set<number>();

describe("CONFLICT_GRADE_ORDER", () => {
  it("orders grades most severe first", () => {
    expect(CONFLICT_GRADE_ORDER).toEqual(["clash", "same-evening", "same-day"]);
  });
});

describe("evaluateConflict", () => {
  it("grades an exact UTC overlap in the same timezone as a clash with overlapMinutes", () => {
    // Candidate 18:00-20:00 CEST = 16:00-18:00Z; event 19:00-21:00 CEST = 17:00-19:00Z.
    const candidate = makeCandidate({ startTime: "18:00", endTime: "20:00" });
    const event = makeEvent({ startTime: "19:00", endTime: "21:00" });
    const verdict = evaluateConflict(candidate, event, NO_RELATED);
    expect(verdict?.grade).toBe("clash");
    expect(verdict?.overlapMinutes).toBe(60);
    expect(verdict?.audienceMatch).toBe("direct");
  });

  it("grades a cross-timezone overlap (18:00 Amsterdam vs 17:00 London, same instant window) as a clash", () => {
    // 18:00 CEST Amsterdam = 16:00Z; 17:00 BST London = 16:00Z — identical window.
    const candidate = makeCandidate({
      format: "online",
      timezone: AMSTERDAM,
      startTime: "18:00",
      endTime: "20:00",
      city: null,
      latitude: null,
      longitude: null,
    });
    const event = makeEvent({
      format: "online",
      timezone: LONDON,
      startTime: "17:00",
      endTime: "19:00",
      city: null,
      latitude: null,
      longitude: null,
    });
    const verdict = evaluateConflict(candidate, event, NO_RELATED);
    expect(verdict?.grade).toBe("clash");
    expect(verdict?.overlapMinutes).toBe(120);
  });

  it("grades an in-person pad-only touch (ends 18:00, starts 18:45, same city) as a clash with overlapMinutes 0", () => {
    // Candidate 16:00-18:00 CEST padded +-60min -> 13:00Z-17:00Z.
    // Event 18:45-20:45 CEST padded +-60min -> 15:45Z-19:45Z. Padded windows
    // overlap (15:45-17:00) but the raw, unpadded windows do not touch.
    const candidate = makeCandidate({ startTime: "16:00", endTime: "18:00" });
    const event = makeEvent({ startTime: "18:45", endTime: "20:45" });
    const verdict = evaluateConflict(candidate, event, NO_RELATED);
    expect(verdict?.grade).toBe("clash");
    expect(verdict?.overlapMinutes).toBe(0);
  });

  it("does not pad online<->online events, so a 30-minute unpadded gap is not a clash but same-evening", () => {
    // Candidate 16:00-18:00, event 18:30-20:30, both online: no +-60min pad
    // applied, so the raw 30-minute gap prevents a clash.
    const candidate = makeCandidate({
      format: "online",
      startTime: "16:00",
      endTime: "18:00",
      city: null,
      latitude: null,
      longitude: null,
    });
    const event = makeEvent({
      format: "online",
      startTime: "18:30",
      endTime: "20:30",
      city: null,
      latitude: null,
      longitude: null,
    });
    const verdict = evaluateConflict(candidate, event, NO_RELATED);
    expect(verdict?.grade).toBe("same-evening");
    expect(verdict?.overlapMinutes).toBeNull();
  });

  it("grades same local day, start times >4h apart, as same-day", () => {
    // Start-to-start gap is 8 hours; both in-person but the +-60min pads
    // (9:00-13:00Z vs 17:00-21:00Z) still don't overlap.
    const candidate = makeCandidate({ startTime: "10:00", endTime: "12:00" });
    const event = makeEvent({ startTime: "18:00", endTime: "20:00" });
    const verdict = evaluateConflict(candidate, event, NO_RELATED);
    expect(verdict?.grade).toBe("same-day");
    expect(verdict?.overlapMinutes).toBeNull();
  });

  it("fails the catchment gate for in-person events with coords >50km apart", () => {
    const candidate = makeCandidate({
      city: "Amsterdam",
      ...AMSTERDAM_COORDS,
    });
    const event = makeEvent({
      city: "Paris",
      ...PARIS_COORDS,
    });
    expect(evaluateConflict(candidate, event, NO_RELATED)).toBeNull();
  });

  it("passes the catchment gate for in-person events with coords <=50km apart", () => {
    const candidate = makeCandidate({
      city: "Amsterdam",
      ...AMSTERDAM_COORDS,
    });
    const event = makeEvent({
      city: "Utrecht",
      ...UTRECHT_COORDS,
    });
    const verdict = evaluateConflict(candidate, event, NO_RELATED);
    expect(verdict).not.toBeNull();
    expect(verdict?.grade).toBe("clash");
  });

  it("passes the catchment gate on case-insensitive city match when coords are missing", () => {
    const candidate = makeCandidate({
      city: "  Amsterdam  ",
      latitude: null,
      longitude: null,
    });
    const event = makeEvent({
      city: "AMSTERDAM",
      latitude: null,
      longitude: null,
    });
    const verdict = evaluateConflict(candidate, event, NO_RELATED);
    expect(verdict).not.toBeNull();
  });

  it("fails the catchment gate (conservatively) for in-person events with neither coords nor city", () => {
    const candidate = makeCandidate({
      city: null,
      latitude: null,
      longitude: null,
    });
    const event = makeEvent({ city: null, latitude: null, longitude: null });
    expect(evaluateConflict(candidate, event, NO_RELATED)).toBeNull();
  });

  it("grades an online-vs-in-person overlap across different countries as a clash regardless of catchment", () => {
    // Candidate online, 20:00-22:00 CEST Amsterdam = 18:00-20:00Z.
    // Event in-person in Tokyo, 03:00-05:00 JST on the following calendar
    // date = 18:00-20:00Z the day before — identical UTC window.
    const candidate = makeCandidate({
      format: "online",
      timezone: AMSTERDAM,
      date: "2026-07-15",
      startTime: "20:00",
      endTime: "22:00",
      city: null,
      latitude: null,
      longitude: null,
    });
    const event = makeEvent({
      format: "in-person",
      timezone: TOKYO,
      date: "2026-07-16",
      startTime: "03:00",
      endTime: "05:00",
      city: "Tokyo",
      latitude: 35.6762,
      longitude: 139.6503,
    });
    const verdict = evaluateConflict(candidate, event, NO_RELATED);
    expect(verdict?.grade).toBe("clash");
  });

  it("downgrades a related-only audience match one grade (clash -> same-evening)", () => {
    const candidate = makeCandidate({
      startTime: "18:00",
      endTime: "20:00",
      audienceIds: [1],
    });
    const event = makeEvent({
      startTime: "19:00",
      endTime: "21:00",
      audienceIds: [2],
    });
    const verdict = evaluateConflict(candidate, event, new Set([2]));
    expect(verdict?.audienceMatch).toBe("related");
    expect(verdict?.grade).toBe("same-evening");
  });

  it("returns null when there is no shared or related audience", () => {
    const candidate = makeCandidate({ audienceIds: [1] });
    const event = makeEvent({ audienceIds: [2] });
    expect(evaluateConflict(candidate, event, NO_RELATED)).toBeNull();
  });

  it("grades a missing startTime on the candidate, same calendar day, as same-day", () => {
    const candidate = makeCandidate({ startTime: null, endTime: null });
    const event = makeEvent({ date: "2026-07-15", startTime: "18:00" });
    const verdict = evaluateConflict(candidate, event, NO_RELATED);
    expect(verdict?.grade).toBe("same-day");
    expect(verdict?.overlapMinutes).toBeNull();
  });

  it("returns null when a missing startTime falls on a different calendar day", () => {
    const candidate = makeCandidate({
      date: "2026-07-15",
      startTime: null,
      endTime: null,
    });
    const event = makeEvent({ date: "2026-07-16", startTime: "18:00" });
    expect(evaluateConflict(candidate, event, NO_RELATED)).toBeNull();
  });

  it("assumes a 120-minute duration when endTime is missing", () => {
    // Candidate 18:00 + 120min default -> ends 20:00. Event 19:30-21:00
    // overlaps the last 30 minutes of that assumed window.
    const candidate = makeCandidate({
      format: "online",
      startTime: "18:00",
      endTime: null,
      city: null,
      latitude: null,
      longitude: null,
    });
    const event = makeEvent({
      format: "online",
      startTime: "19:30",
      endTime: "21:00",
      city: null,
      latitude: null,
      longitude: null,
    });
    const verdict = evaluateConflict(candidate, event, NO_RELATED);
    expect(verdict?.grade).toBe("clash");
    expect(verdict?.overlapMinutes).toBe(30);
  });

  it("computes the correct instant across the spring-forward DST boundary (sanity)", () => {
    // 2026-03-29 is the Amsterdam spring-forward day; 18:00 that day is
    // already CEST (+2), per event-time.test.ts. Both events on this date,
    // online<->online (no pad), 30-minute raw overlap.
    const candidate = makeCandidate({
      format: "online",
      date: "2026-03-29",
      startTime: "18:00",
      endTime: "19:00",
      city: null,
      latitude: null,
      longitude: null,
    });
    const event = makeEvent({
      format: "online",
      date: "2026-03-29",
      startTime: "18:30",
      endTime: "19:30",
      city: null,
      latitude: null,
      longitude: null,
    });
    const verdict = evaluateConflict(candidate, event, NO_RELATED);
    expect(verdict?.grade).toBe("clash");
    expect(verdict?.overlapMinutes).toBe(30);
  });
});
