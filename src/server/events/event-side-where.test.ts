import { describe, expect, it } from "vitest";
import { eventSideBand, eventSideWhere } from "./event-side-where";

const NOW = new Date("2026-09-27T10:00:00.000Z");
const { floor, ceiling } = eventSideBand(NOW);

const BAND = [
  // Later today in Amsterdam; stored 00:00 UTC, already behind now.
  {
    id: 1,
    date: "2026-09-27T00:00:00.000Z",
    startTime: "19:00",
    timezone: "Europe/Amsterdam",
  },
  // Yesterday, date-only, in Amsterdam: over.
  { id: 2, date: "2026-09-26T00:00:00.000Z", timezone: "Europe/Amsterdam" },
  // Yesterday in Los Angeles, where it is 03:00 on the 27th: over.
  { id: 3, date: "2026-09-26T00:00:00.000Z", timezone: "America/Los_Angeles" },
  // Tomorrow: upcoming.
  { id: 4, date: "2026-09-28T00:00:00.000Z", timezone: "Europe/Amsterdam" },
];

describe("eventSideWhere", () => {
  it("keeps today's event upcoming after 00:00 UTC", () => {
    // The old condition, `date >= now`, left event 1 out.
    expect(BAND[0]!.date >= NOW.toISOString()).toBe(false);
    expect(eventSideWhere("upcoming", BAND, NOW)).toEqual({
      or: [{ date: { greater_than_equal: ceiling } }, { id: { in: [1, 4] } }],
    });
  });

  it("names the band's ended events for the past side", () => {
    expect(eventSideWhere("past", BAND, NOW)).toEqual({
      or: [{ date: { less_than: floor } }, { id: { in: [2, 3] } }],
    });
  });

  it("uses the date alone when the band is empty", () => {
    expect(eventSideWhere("upcoming", [], NOW)).toEqual({
      date: { greater_than_equal: ceiling },
    });
    expect(eventSideWhere("past", [], NOW)).toEqual({
      date: { less_than: floor },
    });
  });

  it("splits the stored dates without a gap or an overlap", () => {
    expect(floor < ceiling).toBe(true);
    expect(new Date(ceiling).getTime() - new Date(floor).getTime()).toBe(
      4 * 86_400_000,
    );
  });
});
