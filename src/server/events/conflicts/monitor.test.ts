import { describe, expect, it } from "vitest";

import { DEFAULT_EVENT_TIMEZONE } from "@/lib/event-time";
import type { Audience, Event } from "@/payload-types";
import type { ConflictVerdict, CorpusEvent } from "./rule";
import {
  buildConflictNotification,
  buildMonitorTarget,
  conflictDedupeKey,
  MATERIAL_GRADES,
  MONITOR_HORIZON_DAYS,
  selectMaterialConflicts,
  type MonitorTarget,
} from "./monitor";

function makeAudience(overrides: Partial<Audience> = {}): Audience {
  return {
    id: 1,
    name: "Engineers",
    slug: "engineers",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeEventDoc(overrides: Partial<Event> = {}): Event {
  return {
    id: 1,
    title: "Test Event",
    slug: "test-event",
    description: {
      root: {
        type: "root",
        children: [],
        direction: null,
        format: "",
        indent: 0,
        version: 1,
      },
    },
    type: "meetup",
    location: "Somewhere",
    date: "2026-07-15",
    startTime: "18:00",
    endTime: "20:00",
    timezone: "Europe/Amsterdam",
    format: "in-person",
    city: "Amsterdam",
    latitude: 52.3676,
    longitude: 4.9041,
    audience: [makeAudience()],
    submittedBy: "user-1",
    status: "published",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeCorpusEvent(overrides: Partial<CorpusEvent> = {}): CorpusEvent {
  return {
    id: 200,
    title: "Competing Event",
    date: "2026-07-15",
    startTime: "19:00",
    endTime: "21:00",
    timezone: "Europe/Amsterdam",
    format: "in-person",
    city: "Amsterdam",
    latitude: 52.3676,
    longitude: 4.9041,
    audienceIds: [1],
    tentative: false,
    sourceUrl: null,
    communityId: null,
    ...overrides,
  };
}

function makeVerdict(
  overrides: Partial<ConflictVerdict> = {},
): ConflictVerdict {
  return {
    event: makeCorpusEvent(),
    grade: "clash",
    audienceMatch: "direct",
    tentative: false,
    overlapMinutes: 60,
    ...overrides,
  };
}

function makeTarget(overrides: Partial<MonitorTarget> = {}): MonitorTarget {
  return {
    candidate: {
      date: "2026-07-15",
      startTime: "18:00",
      endTime: "20:00",
      timezone: "Europe/Amsterdam",
      format: "in-person",
      city: "Amsterdam",
      latitude: 52.3676,
      longitude: 4.9041,
      audienceIds: [1],
    },
    audienceSlugs: ["engineers"],
    organizerId: "user-1",
    eventId: 42,
    eventTitle: "AI Meetup",
    eventSlug: "ai-meetup",
    ...overrides,
  };
}

describe("MONITOR_HORIZON_DAYS", () => {
  it("is 30 days", () => {
    expect(MONITOR_HORIZON_DAYS).toBe(30);
  });
});

describe("MATERIAL_GRADES", () => {
  it("is clash and same-evening, most severe first", () => {
    expect(MATERIAL_GRADES).toEqual(["clash", "same-evening"]);
  });
});

describe("buildMonitorTarget", () => {
  it("maps a full event doc (coords, city, slugs) into a monitor target", () => {
    const doc = makeEventDoc({
      id: 42,
      title: "AI Meetup",
      date: "2026-07-15",
      startTime: "18:00",
      endTime: "20:00",
      timezone: "Europe/Amsterdam",
      format: "in-person",
      city: "Amsterdam",
      latitude: 52.3676,
      longitude: 4.9041,
      audience: [
        makeAudience({ id: 1, slug: "engineers" }),
        makeAudience({ id: 2, slug: "designers" }),
      ],
      submittedBy: "user-1",
    });

    expect(buildMonitorTarget(doc)).toEqual({
      candidate: {
        date: "2026-07-15",
        startTime: "18:00",
        endTime: "20:00",
        timezone: "Europe/Amsterdam",
        format: "in-person",
        city: "Amsterdam",
        latitude: 52.3676,
        longitude: 4.9041,
        audienceIds: [1, 2],
      },
      audienceSlugs: ["engineers", "designers"],
      organizerId: "user-1",
      eventId: 42,
      eventTitle: "AI Meetup",
      eventSlug: "test-event",
    });
  });

  it("maps the event doc's slug into eventSlug", () => {
    const doc = makeEventDoc({ slug: "ai-meetup-2026" });
    expect(buildMonitorTarget(doc)?.eventSlug).toBe("ai-meetup-2026");
  });

  it("returns null when submittedBy is empty", () => {
    const doc = makeEventDoc({ submittedBy: "" });
    expect(buildMonitorTarget(doc)).toBeNull();
  });

  it("returns null when submittedBy is null", () => {
    const doc = makeEventDoc({ submittedBy: null });
    expect(buildMonitorTarget(doc)).toBeNull();
  });

  it("returns null when submittedBy is whitespace only", () => {
    const doc = makeEventDoc({ submittedBy: "   " });
    expect(buildMonitorTarget(doc)).toBeNull();
  });

  it("returns null when audience is an empty array", () => {
    const doc = makeEventDoc({ audience: [] });
    expect(buildMonitorTarget(doc)).toBeNull();
  });

  it("returns null when audience is absent", () => {
    const doc = makeEventDoc({ audience: undefined });
    expect(buildMonitorTarget(doc)).toBeNull();
  });

  it("returns null when an audience entry is an unpopulated bare id (unexpected shallow fetch)", () => {
    const doc = makeEventDoc({ audience: [1, makeAudience({ id: 2 })] });
    expect(buildMonitorTarget(doc)).toBeNull();
  });

  it("falls back format to online when the doc's format is null", () => {
    const doc = makeEventDoc({ format: null });
    expect(buildMonitorTarget(doc)?.candidate.format).toBe("online");
  });

  it("falls back timezone to DEFAULT_EVENT_TIMEZONE when the doc's timezone is null", () => {
    const doc = makeEventDoc({ timezone: null });
    expect(buildMonitorTarget(doc)?.candidate.timezone).toBe(
      DEFAULT_EVENT_TIMEZONE,
    );
  });

  it("falls back timezone to DEFAULT_EVENT_TIMEZONE when the doc's timezone is a garbage IANA string", () => {
    const doc = makeEventDoc({ timezone: "Not/AReal_Zone" });
    expect(buildMonitorTarget(doc)?.candidate.timezone).toBe(
      DEFAULT_EVENT_TIMEZONE,
    );
  });

  it("passes through null city/latitude/longitude when absent on the doc", () => {
    const doc = makeEventDoc({ city: null, latitude: null, longitude: null });
    const target = buildMonitorTarget(doc);
    expect(target?.candidate.city).toBeNull();
    expect(target?.candidate.latitude).toBeNull();
    expect(target?.candidate.longitude).toBeNull();
  });
});

describe("selectMaterialConflicts", () => {
  it("keeps a non-tentative clash verdict", () => {
    const clash = makeVerdict({ grade: "clash", tentative: false });
    expect(selectMaterialConflicts([clash])).toEqual([clash]);
  });

  it("keeps a non-tentative same-evening verdict", () => {
    const sameEvening = makeVerdict({
      grade: "same-evening",
      tentative: false,
    });
    expect(selectMaterialConflicts([sameEvening])).toEqual([sameEvening]);
  });

  it("drops a same-day verdict even when non-tentative", () => {
    const sameDay = makeVerdict({ grade: "same-day", tentative: false });
    expect(selectMaterialConflicts([sameDay])).toEqual([]);
  });

  it("drops a tentative verdict regardless of grade", () => {
    const tentativeClash = makeVerdict({ grade: "clash", tentative: true });
    expect(selectMaterialConflicts([tentativeClash])).toEqual([]);
  });

  it("sorts kept verdicts by grade severity (clash before same-evening)", () => {
    const sameEvening = makeVerdict({
      grade: "same-evening",
      event: makeCorpusEvent({ id: 201, date: "2026-07-15" }),
    });
    const clash = makeVerdict({
      grade: "clash",
      event: makeCorpusEvent({ id: 202, date: "2026-07-16" }),
    });
    expect(selectMaterialConflicts([sameEvening, clash])).toEqual([
      clash,
      sameEvening,
    ]);
  });

  it("sorts same-grade verdicts by the conflicting event's date", () => {
    const later = makeVerdict({
      grade: "clash",
      event: makeCorpusEvent({ id: 201, date: "2026-07-20" }),
    });
    const earlier = makeVerdict({
      grade: "clash",
      event: makeCorpusEvent({ id: 202, date: "2026-07-10" }),
    });
    expect(selectMaterialConflicts([later, earlier])).toEqual([earlier, later]);
  });
});

describe("conflictDedupeKey", () => {
  it("formats as event-conflict:{eventId}:{conflictingEventId}", () => {
    expect(conflictDedupeKey(42, 200)).toBe("event-conflict:42:200");
  });

  it("is stable for the same inputs", () => {
    expect(conflictDedupeKey(42, 200)).toBe(conflictDedupeKey(42, 200));
  });

  it("is order-sensitive between eventId and conflictingEventId", () => {
    expect(conflictDedupeKey(42, 200)).not.toBe(conflictDedupeKey(200, 42));
  });
});

describe("buildConflictNotification", () => {
  it("uses singular event/competes wording for exactly one new conflict", () => {
    const target = makeTarget({ eventId: 42, eventTitle: "AI Meetup" });
    const verdict = makeVerdict({
      grade: "clash",
      event: makeCorpusEvent({ id: 200, title: "Competing Event" }),
    });

    const notification = buildConflictNotification(target, [verdict]);

    expect(notification.content).toBe(
      '1 event now competes for your audience around 2026-07-15, including "Competing Event".',
    );
  });

  it("uses plural events/compete wording for multiple new conflicts", () => {
    const target = makeTarget({ eventId: 42, eventTitle: "AI Meetup" });
    const top = makeVerdict({
      grade: "clash",
      event: makeCorpusEvent({ id: 200, title: "Competing Event" }),
    });
    const other = makeVerdict({
      grade: "same-evening",
      event: makeCorpusEvent({ id: 201, title: "Another Event" }),
    });

    const notification = buildConflictNotification(target, [top, other]);

    expect(notification.content).toBe(
      '2 events now compete for your audience around 2026-07-15, including "Competing Event".',
    );
  });

  it("includes the target event's own title in the notification title", () => {
    const target = makeTarget({ eventTitle: "AI Meetup" });
    const verdict = makeVerdict();

    expect(buildConflictNotification(target, [verdict]).title).toBe(
      'Schedule conflict for "AI Meetup"',
    );
  });

  it("carries the target eventId, all conflicting event ids, the top verdict's grade, and reviewPath in metadata", () => {
    const target = makeTarget({ eventId: 42, eventSlug: "ai-meetup" });
    const top = makeVerdict({
      grade: "clash",
      event: makeCorpusEvent({ id: 200 }),
    });
    const other = makeVerdict({
      grade: "same-evening",
      event: makeCorpusEvent({ id: 201 }),
    });

    const notification = buildConflictNotification(target, [top, other]);

    expect(notification.metadata).toEqual({
      eventId: 42,
      conflictingEventIds: [200, 201],
      topGrade: "clash",
      reviewPath: "/events/ai-meetup",
    });
  });

  it("builds reviewPath as a leading-slash path from the target's eventSlug", () => {
    const target = makeTarget({ eventSlug: "quarterly-summit" });
    const notification = buildConflictNotification(target, [makeVerdict()]);

    expect(notification.metadata.reviewPath).toBe("/events/quarterly-summit");
    expect(notification.metadata.reviewPath as string).toMatch(/^\//);
  });

  it("truncates a long event title in the notification title so it stays within the 255-char notifications.title column", () => {
    const longTitle = "A".repeat(300);
    const target = makeTarget({ eventTitle: longTitle });

    const notification = buildConflictNotification(target, [makeVerdict()]);

    expect(notification.title.length).toBeLessThanOrEqual(255);
    expect(notification.title).toBe(
      `Schedule conflict for "${"A".repeat(199)}…"`,
    );
  });

  it("leaves a short event title untouched in the notification title", () => {
    const target = makeTarget({ eventTitle: "AI Meetup" });
    const notification = buildConflictNotification(target, [makeVerdict()]);
    expect(notification.title).toBe('Schedule conflict for "AI Meetup"');
  });
});
