import { describe, expect, it } from "vitest";

import { WEEKDAY_VALUES } from "@/lib/audience-seed";

import type { ConflictCandidate, CorpusEvent } from "./rule";
import { suggestSlots, type SuggestSlotsAudience } from "./suggest";

const AMSTERDAM = "Europe/Amsterdam";
const LOS_ANGELES = "America/Los_Angeles";
const KIRITIMATI = "Pacific/Kiritimati";

// Base chosen date is a Wednesday (2026-07-15): Sun=-3 Mon=-2 Tue=-1 Wed=0
// Thu=+1 Fri=+2 Sat=+3, verified independently before writing these tests.
const CHOSEN_DATE = "2026-07-15";

function makeCandidate(
  overrides: Partial<ConflictCandidate> = {},
): ConflictCandidate {
  return {
    date: CHOSEN_DATE,
    startTime: null,
    endTime: null,
    timezone: AMSTERDAM,
    format: "online",
    city: null,
    latitude: null,
    longitude: null,
    audienceIds: [1],
    ...overrides,
  };
}

function makeCorpusEvent(overrides: Partial<CorpusEvent> = {}): CorpusEvent {
  return {
    id: 100,
    title: "Corpus Event",
    date: "2026-07-16",
    startTime: "08:00",
    endTime: "10:00",
    timezone: AMSTERDAM,
    format: "online",
    city: null,
    latitude: null,
    longitude: null,
    audienceIds: [1],
    tentative: false,
    sourceUrl: null,
    communityId: null,
    ...overrides,
  };
}

function makeAudience(
  overrides: Partial<SuggestSlotsAudience> = {},
): SuggestSlotsAudience {
  return {
    id: 1,
    slug: "engineers",
    preferredSlots: [],
    ...overrides,
  };
}

const NOW_WELL_BEFORE = new Date("2026-07-01T00:00:00Z");
const NO_RELATED = new Set<number>();

describe("suggestSlots", () => {
  it("ranks a clear slot on +2 above a same-day-only slot on +1 (crowded week)", () => {
    const candidate = makeCandidate();
    const audiences = [
      makeAudience({
        preferredSlots: [
          { weekdays: ["thu", "fri"], startTime: "18:00", endTime: "20:00" },
        ],
      }),
    ];
    // Thursday (+1) 08:00-10:00 corpus event: 10h start-gap from the 18:00
    // suggestion (not same-evening), no overlap (not clash), same calendar
    // day -> same-day. It does not touch the Friday (+2) suggestion at all.
    const corpus = [
      makeCorpusEvent({
        date: "2026-07-16",
        startTime: "08:00",
        endTime: "10:00",
      }),
    ];

    const result = suggestSlots({
      candidate,
      corpus,
      relatedIdSet: NO_RELATED,
      audiences,
      now: NOW_WELL_BEFORE,
      windowDays: 3,
    });

    expect(result).toHaveLength(2);
    expect(result[0]!.dayOffset).toBe(2);
    expect(result[0]!.date).toBe("2026-07-17");
    expect(result[0]!.reasons).toContain("clear");
    expect(result[1]!.dayOffset).toBe(1);
    expect(result[1]!.date).toBe("2026-07-16");
    expect(result[1]!.reasons).not.toContain("clear");
  });

  it("matches weekdays against the event-local calendar date, immune to midnight-UTC projection", () => {
    // 2026-07-16 is a Thursday as a calendar date (authoritative in the
    // event's timezone). A buggy implementation that builds
    // `new Date("2026-07-16")` (midnight UTC) and formats its weekday in
    // America/Los_Angeles would see Jul 15 (a Wednesday) and misplace the
    // Thursday slot on 2026-07-17 instead.
    const candidate = makeCandidate({ timezone: LOS_ANGELES });
    const audiences = [
      makeAudience({
        preferredSlots: [
          { weekdays: ["thu"], startTime: "10:00", endTime: "11:00" },
        ],
      }),
    ];

    const result = suggestSlots({
      candidate,
      corpus: [],
      relatedIdSet: NO_RELATED,
      audiences,
      now: NOW_WELL_BEFORE,
      windowDays: 2,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.dayOffset).toBe(1);
    expect(result[0]!.date).toBe("2026-07-16");
    expect(result[0]!.startTime).toBe("10:00");
  });

  it("computes 'today' for past-day skipping in the event's timezone, not UTC", () => {
    // `now` is 2026-07-15T11:00Z: still July 15 in UTC, but already
    // 2026-07-16 01:00 in Pacific/Kiritimati (UTC+14). Days strictly before
    // the event-local today (offsets -1 and 0) must be skipped; a UTC-based
    // implementation would keep offset 0.
    const candidate = makeCandidate({ timezone: KIRITIMATI });
    const audiences = [
      makeAudience({
        preferredSlots: [
          {
            weekdays: [...WEEKDAY_VALUES],
            startTime: "09:00",
            endTime: "10:00",
          },
        ],
      }),
    ];

    const result = suggestSlots({
      candidate,
      corpus: [],
      relatedIdSet: NO_RELATED,
      audiences,
      now: new Date("2026-07-15T11:00:00Z"),
      windowDays: 1,
    });

    expect(result.map((s) => s.dayOffset)).toEqual([1]);
    expect(result[0]!.date).toBe("2026-07-16");
  });

  it("skips days strictly before now in the event's timezone, including the chosen date itself", () => {
    const candidate = makeCandidate();
    const audiences = [
      makeAudience({
        preferredSlots: [
          {
            weekdays: ["wed", "thu", "fri"],
            startTime: "18:00",
            endTime: "20:00",
          },
        ],
      }),
    ];
    // "Now" is midday Amsterdam time on 2026-07-16 -- the chosen date
    // (2026-07-15, offset 0) is already in the past in the event's zone.
    const now = new Date("2026-07-16T10:00:00Z");

    const result = suggestSlots({
      candidate,
      corpus: [],
      relatedIdSet: NO_RELATED,
      audiences,
      now,
      windowDays: 2,
    });

    const offsets = result.map((s) => s.dayOffset).sort((a, b) => a - b);
    expect(offsets).toEqual([1, 2]);
    expect(result.find((s) => s.dayOffset === 0)).toBeUndefined();
  });

  it("falls back to the organizer's original time on other days when the audience has no preferred slots", () => {
    const candidate = makeCandidate({ startTime: "18:00", endTime: "20:00" });
    const audiences = [makeAudience({ preferredSlots: [] })];

    const result = suggestSlots({
      candidate,
      corpus: [],
      relatedIdSet: NO_RELATED,
      audiences,
      now: NOW_WELL_BEFORE,
      windowDays: 2,
    });

    expect(result.map((s) => s.dayOffset)).toEqual([-1, 1, -2, 2]);
    for (const suggestion of result) {
      expect(suggestion.startTime).toBe("18:00");
      expect(suggestion.endTime).toBe("20:00");
      expect(suggestion.reasons).toContain("original-time");
      expect(suggestion.reasons).toContain("clear");
    }
  });

  it("de-dupes identical slots shared by two audiences, merging both preferred: reasons", () => {
    const candidate = makeCandidate({ audienceIds: [1, 2] });
    const audiences = [
      makeAudience({
        id: 1,
        slug: "engineers",
        preferredSlots: [
          { weekdays: ["thu"], startTime: "18:00", endTime: "20:00" },
        ],
      }),
      makeAudience({
        id: 2,
        slug: "founders",
        preferredSlots: [
          { weekdays: ["thu"], startTime: "18:00", endTime: "20:00" },
        ],
      }),
    ];

    const result = suggestSlots({
      candidate,
      corpus: [],
      relatedIdSet: NO_RELATED,
      audiences,
      now: NOW_WELL_BEFORE,
      windowDays: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.reasons).toEqual([
      "preferred:engineers",
      "preferred:founders",
      "clear",
    ]);
  });

  it("honors maxResults, returning only the top-ranked candidates", () => {
    const candidate = makeCandidate({ startTime: "18:00", endTime: "20:00" });
    const audiences = [
      makeAudience({
        preferredSlots: [
          {
            weekdays: [...WEEKDAY_VALUES],
            startTime: "09:00",
            endTime: "10:00",
          },
        ],
      }),
    ];

    const result = suggestSlots({
      candidate,
      corpus: [],
      relatedIdSet: NO_RELATED,
      audiences,
      now: NOW_WELL_BEFORE,
      maxResults: 3,
    });

    expect(result).toHaveLength(3);
    expect(result.map((s) => s.dayOffset)).toEqual([0, -1, 1]);
  });

  it("with an empty corpus, ranks preferred slots purely by |dayOffset| (nearest first)", () => {
    const candidate = makeCandidate();
    const audiences = [
      makeAudience({
        preferredSlots: [
          {
            weekdays: [...WEEKDAY_VALUES],
            startTime: "09:00",
            endTime: "10:00",
          },
        ],
      }),
    ];

    const result = suggestSlots({
      candidate,
      corpus: [],
      relatedIdSet: NO_RELATED,
      audiences,
      now: NOW_WELL_BEFORE,
      windowDays: 3,
    });

    expect(result.map((s) => s.dayOffset)).toEqual([0, -1, 1, -2, 2]);
  });

  it("is deterministic: identical input produces identical output", () => {
    const candidate = makeCandidate({ startTime: "18:00", endTime: "20:00" });
    const audiences = [
      makeAudience({
        id: 1,
        slug: "engineers",
        preferredSlots: [
          { weekdays: ["thu", "fri"], startTime: "18:00", endTime: "20:00" },
        ],
      }),
      makeAudience({
        id: 2,
        slug: "founders",
        preferredSlots: [
          { weekdays: ["tue", "wed"], startTime: "17:00", endTime: "19:00" },
        ],
      }),
    ];
    const corpus = [
      makeCorpusEvent({
        date: "2026-07-16",
        startTime: "18:30",
        endTime: "19:30",
      }),
      makeCorpusEvent({
        id: 101,
        date: "2026-07-14",
        startTime: "17:30",
        endTime: "18:30",
      }),
    ];
    const input = {
      candidate,
      corpus,
      relatedIdSet: NO_RELATED,
      audiences: [audiences[0]!, audiences[1]!],
      now: NOW_WELL_BEFORE,
      windowDays: 5,
      maxResults: 5,
    };

    const first = suggestSlots(input);
    const second = suggestSlots(input);

    expect(second).toEqual(first);
  });
});
