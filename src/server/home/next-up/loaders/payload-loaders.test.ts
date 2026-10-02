// @vitest-environment node
/**
 * The Payload-backed loaders with the database and Payload stood in for:
 * asserts what they ask Payload for (batched, filtered, localized), not
 * only what they return.
 */
import { describe, expect, it, vi } from "vitest";

import type { NextUpContext } from "../types";
import { loadChallengeItems } from "./challenges";
import { loadEventItems, NEXT_UP_EVENT_LIMIT } from "./events";

const NOW = new Date("2026-10-02T10:00:00.000Z");

/** `db.select().from().where()` resolving to `rows`. */
function dbReturning(rows: unknown[]) {
  const where = vi.fn(async () => rows);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { db: { select } as unknown as NextUpContext["db"], select, where };
}

function payloadReturning(docs: unknown[]) {
  const find = vi.fn(async () => ({ docs }));
  return { payload: { find }, find };
}

function context(
  db: NextUpContext["db"],
  payload: { find: unknown } | null,
  locale: "en" | "nl" = "nl",
) {
  const getPayload = vi.fn(async () => {
    if (!payload) throw new Error("Payload must not be started");
    return payload as Awaited<ReturnType<NextUpContext["getPayload"]>>;
  });
  const ctx: NextUpContext = { db, userId: "u1", locale, now: NOW, getPayload };
  return { ctx, getPayload };
}

function registration(id: string, eventId: number, status = "registered") {
  return { id, eventId, userId: "u1", status };
}

function eventDoc(id: number, date: string, startTime: string | null = null) {
  return {
    id,
    slug: `event-${id}`,
    title: `Event ${id}`,
    date,
    startTime,
    endTime: null,
    timezone: "Europe/Amsterdam",
  };
}

describe("loadEventItems", () => {
  it("looks up all registered events in one localized Payload call, skipping draft, rejected, cancelled and old ones", async () => {
    const { db } = dbReturning([
      registration("r1", 11),
      registration("r2", 12, "waitlisted"),
      registration("r3", 11, "intent"),
    ]);
    const { payload, find } = payloadReturning([]);
    const { ctx } = context(db, payload, "nl");

    await loadEventItems(ctx);

    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith({
      collection: "events",
      where: {
        and: [
          { id: { in: [11, 12] } },
          { status: { not_in: ["draft", "rejected", "cancelled"] } },
          { date: { greater_than_equal: "2026-09-30T10:00:00.000Z" } },
        ],
      },
      locale: "nl",
      limit: 2,
      depth: 0,
    });
  });

  it("returns the next three upcoming events, soonest first, as time-bound items", async () => {
    const { db } = dbReturning([
      registration("r-past", 1),
      registration("r-far", 2),
      registration("r-soon", 3, "waitlisted"),
      registration("r-mid", 4, "pending_payment"),
      registration("r-later", 5, "intent"),
    ]);
    const { payload } = payloadReturning([
      eventDoc(1, "2026-09-30T00:00:00.000Z"),
      eventDoc(2, "2026-12-01T00:00:00.000Z"),
      eventDoc(3, "2026-10-03T00:00:00.000Z", "18:00"),
      eventDoc(4, "2026-10-10T00:00:00.000Z", "09:00"),
      eventDoc(5, "2026-11-01T00:00:00.000Z"),
    ]);
    const { ctx } = context(db, payload);

    const items = await loadEventItems(ctx);

    expect(items).toHaveLength(NEXT_UP_EVENT_LIMIT);
    expect(items.map((i) => i.key)).toEqual([
      "event:r-soon",
      "event:r-mid",
      "event:r-later",
    ]);
    expect(items[0]).toEqual({
      kind: "event",
      key: "event:r-soon",
      urgency: { tier: "timeBound", at: "2026-10-03T16:00:00.000Z" },
      eventId: 3,
      slug: "event-3",
      title: "Event 3",
      startsAt: "2026-10-03T16:00:00.000Z",
      endsAt: null,
      allDay: false,
      happeningNow: false,
      registration: "waitlisted",
    });
  });

  it("marks an event that has started but not ended as happening now, ahead of later ones", async () => {
    const { db } = dbReturning([
      registration("r-later", 1),
      registration("r-live", 2),
      registration("r-today", 3),
    ]);
    const { payload } = payloadReturning([
      eventDoc(1, "2026-10-02T00:00:00.000Z", "18:00"),
      // 11:00–13:00 Amsterdam = 09:00–11:00 UTC; now is 10:00 UTC.
      { ...eventDoc(2, "2026-10-02T00:00:00.000Z", "11:00"), endTime: "13:00" },
      // No start time: runs all of its day.
      eventDoc(3, "2026-10-02T00:00:00.000Z"),
    ]);
    const { ctx } = context(db, payload);

    const items = await loadEventItems(ctx);

    expect(
      items.map(({ key, happeningNow, allDay, endsAt }) => ({
        key,
        happeningNow,
        allDay,
        endsAt,
      })),
    ).toEqual([
      // All day starts at local midnight, so it sorts first.
      { key: "event:r-today", happeningNow: true, allDay: true, endsAt: null },
      {
        key: "event:r-live",
        happeningNow: true,
        allDay: false,
        endsAt: "2026-10-02T11:00:00.000Z",
      },
      {
        key: "event:r-later",
        happeningNow: false,
        allDay: false,
        endsAt: null,
      },
    ]);
  });

  it("does not start Payload when the member has no registrations", async () => {
    const { db } = dbReturning([]);
    const { ctx, getPayload } = context(db, null);
    expect(await loadEventItems(ctx)).toEqual([]);
    expect(getPayload).not.toHaveBeenCalled();
  });
});

function challengeDoc(id: number, endsAt: string | null) {
  return { id, slug: `challenge-${id}`, title: `Challenge ${id}`, endsAt };
}

describe("loadChallengeItems", () => {
  it("looks up the active challenges of all active enrollments in one Payload call", async () => {
    const { db } = dbReturning([
      { id: "e1", challengeId: 7 },
      { id: "e2", challengeId: 8 },
    ]);
    const { payload, find } = payloadReturning([]);
    const { ctx } = context(db, payload);

    await loadChallengeItems(ctx);

    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith({
      collection: "challenges",
      where: {
        and: [{ id: { in: [7, 8] } }, { status: { equals: "active" } }],
      },
      limit: 2,
      depth: 0,
    });
  });

  it("makes deadlines time-bound, open-ended challenges ongoing, and drops passed deadlines and missing challenges", async () => {
    const { db } = dbReturning([
      { id: "e-deadline", challengeId: 1 },
      { id: "e-open", challengeId: 2 },
      { id: "e-passed", challengeId: 3 },
      { id: "e-gone", challengeId: 4 },
    ]);
    const { payload } = payloadReturning([
      challengeDoc(1, "2026-10-08T12:00:00.000Z"),
      challengeDoc(2, null),
      challengeDoc(3, "2026-10-01T12:00:00.000Z"),
    ]);
    const { ctx } = context(db, payload);

    const items = await loadChallengeItems(ctx);

    expect(items).toEqual([
      {
        kind: "challenge",
        key: "challenge:e-deadline",
        urgency: { tier: "timeBound", at: "2026-10-08T12:00:00.000Z" },
        challengeId: 1,
        slug: "challenge-1",
        title: "Challenge 1",
        endsAt: "2026-10-08T12:00:00.000Z",
      },
      {
        kind: "challenge",
        key: "challenge:e-open",
        urgency: { tier: "ongoing" },
        challengeId: 2,
        slug: "challenge-2",
        title: "Challenge 2",
        endsAt: null,
      },
    ]);
  });

  it("does not start Payload when the member has no active enrollment", async () => {
    const { db } = dbReturning([]);
    const { ctx, getPayload } = context(db, null);
    expect(await loadChallengeItems(ctx)).toEqual([]);
    expect(getPayload).not.toHaveBeenCalled();
  });
});
