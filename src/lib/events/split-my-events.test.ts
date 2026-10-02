import { describe, expect, it } from "vitest";
import { splitMyEvents } from "./split-my-events";

const NOW = new Date("2026-09-27T10:00:00.000Z");

function pair(
  id: number,
  date: string,
  extra: {
    status?: string;
    startTime?: string;
    endTime?: string;
    timezone?: string;
  } = {},
) {
  return {
    registration: { status: extra.status ?? "registered" },
    event: {
      id,
      date,
      startTime: extra.startTime ?? null,
      endTime: extra.endTime ?? null,
      timezone: extra.timezone ?? "Europe/Amsterdam",
    },
  };
}

const ids = (list: { event: { id: number } }[]) => list.map((p) => p.event.id);

describe("splitMyEvents", () => {
  it("keeps an event later today upcoming after 00:00 UTC", () => {
    // Stored as 00:00 UTC of today; the old `new Date(date) >= now` put
    // it in Past from 00:00 UTC on, hours before it started.
    const today = pair(1, "2026-09-27T00:00:00.000Z", { startTime: "19:00" });
    expect(new Date(today.event.date) >= NOW).toBe(false);
    const { upcoming, past } = splitMyEvents([today], NOW);
    expect(ids(upcoming)).toEqual([1]);
    expect(past).toEqual([]);
  });

  it("keeps a date-only event upcoming all of its own day", () => {
    const la = pair(1, "2026-09-26T00:00:00.000Z", {
      timezone: "America/Los_Angeles",
    });
    // At 10:00 UTC it is 03:00 on the 27th in Los Angeles (the 26th is
    // over there) and 19:00 on the 27th in Tokyo (the 27th is still on).
    const tokyo = pair(2, "2026-09-27", { timezone: "Asia/Tokyo" });
    const { upcoming, past } = splitMyEvents([la, tokyo], NOW);
    expect(ids(upcoming)).toEqual([2]);
    expect(ids(past)).toEqual([1]);
  });

  it("orders upcoming by real start and past by latest start", () => {
    const { upcoming, past } = splitMyEvents(
      [
        pair(1, "2026-10-01", { startTime: "19:00" }),
        pair(2, "2026-10-01", { startTime: "09:00" }),
        pair(3, "2026-09-01"),
        pair(4, "2026-09-20"),
      ],
      NOW,
    );
    expect(ids(upcoming)).toEqual([2, 1]);
    expect(ids(past)).toEqual([4, 3]);
  });

  it("files an attended event under past even while it runs", () => {
    const { upcoming, past } = splitMyEvents(
      [
        pair(1, "2026-09-27", {
          status: "attended",
          startTime: "09:00",
          endTime: "22:00",
        }),
      ],
      NOW,
    );
    expect(upcoming).toEqual([]);
    expect(ids(past)).toEqual([1]);
  });
});
