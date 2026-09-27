import { afterEach, describe, expect, it } from "vitest";
import {
  presentUpcomingEvents,
  upcomingEventKind,
  upcomingEventPlace,
  type UpcomingEventInput,
  type UpcomingEventLabels,
} from "./upcoming-event-rows";

const EN: UpcomingEventLabels = {
  types: {
    workshop: "Workshop",
    hackathon: "Hackathon",
    deep_dive: "Deep Dive",
    meetup: "Meetup",
  },
  online: "Online",
  hybrid: "Hybrid",
  inPerson: "In person",
  next: "Next up",
  hostedBy: (name) => `by ${name}`,
};

const NL: UpcomingEventLabels = {
  ...EN,
  hybrid: "Hybride",
  inPerson: "Op locatie",
  next: "Volgende",
  hostedBy: (name) => `door ${name}`,
};

const NOW = new Date("2026-09-27T10:00:00.000Z");

const CONFERENCE: UpcomingEventInput = {
  id: 1,
  slug: "the-ai-conference-2026",
  title: "The AI Conference 2026",
  type: "meetup",
  format: "in-person",
  date: "2026-09-29T00:00:00.000Z",
  startTime: "09:00",
  timezone: "America/Los_Angeles",
  city: "San Francisco",
  country: "United States",
  location: "Pier 48, San Francisco",
};

const HACKATHON: UpcomingEventInput = {
  id: 2,
  slug: "agents-hackathon",
  title: "Agents Hackathon",
  type: "hackathon",
  format: "in-person",
  date: "2026-10-05T00:00:00.000Z",
  startTime: "10:00",
  timezone: "Europe/Amsterdam",
  city: "Utrecht",
  country: "Netherlands",
  location: "Utrecht",
  host: "AIT Community Netherlands",
};

const ONLINE_WORKSHOP: UpcomingEventInput = {
  id: 3,
  slug: "prompting-workshop",
  title: "Prompting workshop",
  type: "workshop",
  format: "online",
  date: "2026-10-14",
  startTime: null,
  timezone: "Europe/Amsterdam",
  city: null,
  country: null,
  location: "Online",
};

const HYBRID_DEEP_DIVE: UpcomingEventInput = {
  id: 4,
  slug: "rag-deep-dive",
  title: "RAG deep-dive",
  type: "deep_dive",
  format: "hybrid",
  date: "2026-11-12T00:00:00.000Z",
  startTime: "19:00",
  timezone: "Europe/Amsterdam",
  city: "Amsterdam",
  country: "Netherlands",
  location: "Pakhuis de Zwijger, Amsterdam",
};

const ALL = [CONFERENCE, HACKATHON, ONLINE_WORKSHOP, HYBRID_DEEP_DIVE];

function present(
  events: UpcomingEventInput[],
  locale: "en" | "nl" = "en",
  now = NOW,
) {
  return presentUpcomingEvents(events, {
    locale,
    labels: locale === "en" ? EN : NL,
    now,
  });
}

describe("presentUpcomingEvents — when", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("shows the event's own day and start time with its zone", () => {
    const [row] = present([CONFERENCE]);
    expect(row).toMatchObject({
      dateTime: "2026-09-29",
      day: "29",
      month: "SEP",
      weekday: "TUE",
      year: null,
      time: "09:00 PDT",
    });
  });

  it("does not move the day for a viewer west of UTC", () => {
    // `new Date("2026-09-29T00:00Z").getDate()` is the 28th here.
    process.env.TZ = "America/Los_Angeles";
    expect(new Date(CONFERENCE.date).getDate()).toBe(28);
    const [row] = present([CONFERENCE]);
    expect(row?.day).toBe("29");
    expect(row?.weekday).toBe("TUE");
  });

  it("does not move a date-only value either", () => {
    process.env.TZ = "Pacific/Honolulu";
    const [row] = present([ONLINE_WORKSHOP]);
    expect(row).toMatchObject({
      dateTime: "2026-10-14",
      day: "14",
      weekday: "WED",
    });
  });

  it("zero-pads single-digit days", () => {
    const [row] = present([HACKATHON]);
    expect(row).toMatchObject({ day: "05", month: "OCT", weekday: "MON" });
  });

  it("names winter and summer time in the event's zone", () => {
    const [summer, winter] = present([HACKATHON, HYBRID_DEEP_DIVE]);
    expect(summer?.time).toBe("10:00 CEST");
    expect(winter?.time).toBe("19:00 CET");
  });

  it("leaves the time out when there is no start time", () => {
    const [row] = present([ONLINE_WORKSHOP]);
    expect(row?.time).toBeNull();
  });

  it("keeps a start time without a usable zone, unqualified", () => {
    const [row] = present([{ ...CONFERENCE, timezone: null }]);
    expect(row?.time).toBe("09:00");
  });

  it("adds the year only when it is not this year", () => {
    const [row] = present([{ ...CONFERENCE, date: "2027-01-08" }]);
    expect(row).toMatchObject({ day: "08", month: "JAN", year: "2027" });
  });

  it("degrades a corrupt date instead of throwing", () => {
    const [row] = present([{ ...CONFERENCE, date: "soon" }]);
    expect(row).toMatchObject({ dateTime: null, day: "--" });
  });

  it("uses Dutch day and month names", () => {
    const [row] = present([HACKATHON], "nl");
    expect(row).toMatchObject({ day: "05", month: "OKT", weekday: "MA" });
  });
});

describe("upcomingEventPlace", () => {
  it("gives city and country for an in-person event", () => {
    expect(upcomingEventPlace(CONFERENCE, EN)).toBe(
      "San Francisco, United States",
    );
  });

  it("says Online for an online event, whatever the city", () => {
    expect(upcomingEventPlace(ONLINE_WORKSHOP, EN)).toBe("Online");
    expect(
      upcomingEventPlace({ ...ONLINE_WORKSHOP, city: "Amsterdam" }, EN),
    ).toBe("Online");
  });

  it("treats a legacy 'Online' location as online", () => {
    expect(
      upcomingEventPlace({ format: null, location: "online", city: null }, EN),
    ).toBe("Online");
  });

  it("adds Hybrid to the city of a hybrid event", () => {
    expect(upcomingEventPlace(HYBRID_DEEP_DIVE, EN)).toBe(
      "Amsterdam, Netherlands · Hybrid",
    );
    expect(upcomingEventPlace(HYBRID_DEEP_DIVE, NL)).toBe(
      "Amsterdam, Netherlands · Hybride",
    );
    expect(
      upcomingEventPlace(
        { format: "hybrid", location: "Online", city: null },
        EN,
      ),
    ).toBe("Hybrid");
  });

  it("does not repeat a country that equals the city", () => {
    expect(
      upcomingEventPlace(
        { format: "in-person", city: "Singapore", country: "Singapore" },
        EN,
      ),
    ).toBe("Singapore");
  });

  it("falls back to the venue text when there is no city", () => {
    expect(
      upcomingEventPlace(
        { format: "in-person", city: null, location: "Pakhuis de Zwijger" },
        EN,
      ),
    ).toBe("Pakhuis de Zwijger");
  });

  it("says In person rather than invent a place", () => {
    expect(
      upcomingEventPlace(
        { format: "in-person", city: null, location: "TBA" },
        NL,
      ),
    ).toBe("Op locatie");
    expect(
      upcomingEventPlace({ format: null, city: null, location: "TBA" }, EN),
    ).toBeNull();
  });
});

describe("upcomingEventKind", () => {
  it("labels every known type in the given language", () => {
    expect(upcomingEventKind("meetup", EN)).toEqual({
      type: "meetup",
      label: "Meetup",
    });
    expect(upcomingEventKind("deep_dive", EN).label).toBe("Deep Dive");
    expect(upcomingEventKind("hackathon", NL).label).toBe("Hackathon");
  });

  it("shows a legacy type as written, not as a guess", () => {
    expect(upcomingEventKind("panel_talk", EN)).toEqual({
      type: null,
      label: "panel talk",
    });
  });

  it("keeps a meetup a meetup, even when it is big", () => {
    const [row] = present([CONFERENCE]);
    expect(row?.kind).toEqual({ type: "meetup", label: "Meetup" });
  });
});

describe("presentUpcomingEvents — rows", () => {
  it("marks only the first row as next", () => {
    const rows = present(ALL);
    expect(rows.map((r) => r.isNext)).toEqual([true, false, false, false]);
  });

  it("links each row to its event page", () => {
    expect(present(ALL).map((r) => r.href)).toEqual([
      "/events/the-ai-conference-2026",
      "/events/agents-hackathon",
      "/events/prompting-workshop",
      "/events/rag-deep-dive",
    ]);
  });

  it("credits the host community when known", () => {
    const [conference, hackathon] = present([CONFERENCE, HACKATHON], "nl");
    expect(conference?.host).toBeNull();
    expect(hackathon?.host).toBe("door AIT Community Netherlands");
  });

  it("reads aloud as title, date and time, place, kind", () => {
    const [first, second, third] = present([
      CONFERENCE,
      HACKATHON,
      ONLINE_WORKSHOP,
    ]);
    expect(first?.accessibleName).toBe(
      "The AI Conference 2026, Next up, Tuesday, September 29, 2026, 09:00 PDT, San Francisco, United States, Meetup",
    );
    expect(second?.accessibleName).toBe(
      "Agents Hackathon, Monday, October 5, 2026, 10:00 CEST, Utrecht, Netherlands, by AIT Community Netherlands, Hackathon",
    );
    expect(third?.accessibleName).toBe(
      "Prompting workshop, Wednesday, October 14, 2026, Online, Workshop",
    );
  });

  it("reads aloud in Dutch", () => {
    const [row] = present([HYBRID_DEEP_DIVE], "nl");
    expect(row?.accessibleName).toBe(
      "RAG deep-dive, Volgende, donderdag 12 november 2026, 19:00 CET, Amsterdam, Netherlands, Hybride, Deep Dive",
    );
  });

  it("returns no rows for no events", () => {
    expect(present([])).toEqual([]);
  });
});
