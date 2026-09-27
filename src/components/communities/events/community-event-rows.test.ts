import { describe, expect, it } from "vitest";
import {
  presentEventRows,
  type EventRowLabels,
} from "@/components/events/rows/event-rows";
import {
  communityEventLink,
  splitCommunityEvents,
  toCommunityEventRowInput,
  type CommunityEventContext,
  type CommunityEventItem,
} from "./community-event-rows";

const NOW = new Date("2026-09-27T10:00:00.000Z");

const EN: EventRowLabels = {
  types: {
    workshop: "Workshop",
    hackathon: "Hackathon",
    deep_dive: "Deep Dive",
    meetup: "Meetup",
  },
  online: "Online",
  hybrid: "Hybrid",
  inPerson: "In person",
  hostedBy: (name) => `by ${name}`,
  placeToBeAnnounced: "Place to be announced",
};

const PUBLISHED: CommunityEventContext = {
  communitySlug: "ai-amsterdam",
  view: "published",
  isAdminOrOwner: false,
};

function item(
  id: number | string,
  overrides: Partial<CommunityEventItem> = {},
): CommunityEventItem {
  return {
    id,
    slug: `event-${id}`,
    title: `Event ${id}`,
    type: "meetup",
    date: "2026-10-01T00:00:00.000Z",
    startTime: "18:00",
    endTime: "21:00",
    timezone: "Europe/Amsterdam",
    location: "Pakhuis de Zwijger",
    format: "in-person",
    city: "Amsterdam",
    country: "Netherlands",
    status: "published",
    source: "native",
    lumaUrl: null,
    ...overrides,
  };
}

describe("communityEventLink", () => {
  it("opens a published event's public page", () => {
    expect(communityEventLink(item(1), PUBLISHED)).toEqual({
      kind: "internal",
      href: "/events/event-1",
    });
  });

  it("opens a live Luma row on Luma, in a new tab", () => {
    expect(
      communityEventLink(
        item("luma-a", {
          slug: null,
          source: "luma",
          lumaUrl: "https://lu.ma/abc",
        }),
        PUBLISHED,
      ),
    ).toEqual({ kind: "external", href: "https://lu.ma/abc" });
    expect(
      communityEventLink(
        item("luma-b", { slug: null, source: "luma", lumaUrl: null }),
        PUBLISHED,
      ),
    ).toBeNull();
  });

  it("never links a row in the pending queue (#214)", () => {
    const context = { ...PUBLISHED, view: "pending" as const };
    expect(communityEventLink(item(1, { status: "draft" }), context)).toBe(
      null,
    );
    expect(
      communityEventLink(item(2, { status: "draft", type: "hackathon" }), {
        ...context,
        isAdminOrOwner: true,
      }),
    ).toBeNull();
  });

  it("sends owners and admins to a draft hackathon's manage page", () => {
    const hackathon = item(3, { status: "draft", type: "hackathon" });
    const mine = { ...PUBLISHED, view: "mine" as const };
    expect(
      communityEventLink(hackathon, { ...mine, isAdminOrOwner: true }),
    ).toEqual({
      kind: "internal",
      href: "/communities/ai-amsterdam/events/event-3/manage",
    });
    expect(communityEventLink(hackathon, mine)).toBeNull();
  });

  it("does not link drafts or rejected submissions (their page 404s)", () => {
    const mine = { ...PUBLISHED, view: "mine" as const };
    expect(communityEventLink(item(4, { status: "draft" }), mine)).toBeNull();
    expect(
      communityEventLink(item(5, { status: "rejected" }), mine),
    ).toBeNull();
  });
});

describe("splitCommunityEvents", () => {
  it("puts what is ahead soonest-first and what took place latest-first", () => {
    const events = [
      item("later", { date: "2026-10-20T00:00:00.000Z" }),
      item("old", { date: "2026-03-02T00:00:00.000Z" }),
      item("soon", { date: "2026-09-30T00:00:00.000Z" }),
      item("recent", { date: "2026-09-12T00:00:00.000Z" }),
    ];
    const { upcoming, past } = splitCommunityEvents(events, NOW);
    expect(upcoming.map((e) => e.id)).toEqual(["soon", "later"]);
    expect(past.map((e) => e.id)).toEqual(["recent", "old"]);
  });

  it("orders same-day events by their real start, across zones", () => {
    const { upcoming } = splitCommunityEvents(
      [
        // 09:00 in San Francisco is 18:00 in Amsterdam: it starts later.
        item("sf", {
          date: "2026-10-01T00:00:00.000Z",
          startTime: "09:00",
          timezone: "America/Los_Angeles",
        }),
        item("ams", {
          date: "2026-10-01T00:00:00.000Z",
          startTime: "12:00",
          timezone: "Europe/Amsterdam",
        }),
      ],
      NOW,
    );
    expect(upcoming.map((e) => e.id)).toEqual(["ams", "sf"]);
  });

  it("keeps a running event upcoming until it ends where it happens", () => {
    const today = item("today", {
      date: "2026-09-27T00:00:00.000Z",
      startTime: "09:00",
      endTime: "17:00",
    });
    const dateOnlyToday = item("date-only", {
      date: "2026-09-27",
      startTime: null,
      endTime: null,
    });
    const { upcoming, past } = splitCommunityEvents(
      [today, dateOnlyToday],
      NOW,
    );
    expect(upcoming.map((e) => e.id)).toEqual(["date-only", "today"]);
    expect(past).toEqual([]);
  });
});

describe("community rows through the shared presenter", () => {
  function present(events: CommunityEventItem[], locale = "en") {
    return presentEventRows(
      events.map((e) => toCommunityEventRowInput(e, PUBLISHED)),
      { locale, labels: EN, now: NOW },
    );
  }

  it("shows the event-local day, never the viewer's", () => {
    // Stored as the event-local calendar date: the 5th, whatever zone reads it.
    const [row] = present([
      item(1, {
        date: "2026-07-05T00:00:00.000Z",
        startTime: "19:00",
        timezone: "America/New_York",
      }),
    ]);
    expect(row?.dateTime).toBe("2026-07-05");
    expect(`${row?.day} ${row?.month}`).toBe("05 Jul");
    expect(row?.time).toBe("19:00 EDT");
  });

  it("handles a date-only event without a time", () => {
    const [row] = present([
      item(2, { date: "2026-11-03", startTime: null, endTime: null }),
    ]);
    expect(row?.dateTime).toBe("2026-11-03");
    expect(row?.time).toBeNull();
  });

  it("says Online for an online event, and Hybrid beside the city", () => {
    const [online, hybrid] = present([
      item(3, { format: "online", city: null, location: "Online" }),
      item(4, { format: "hybrid" }),
    ]);
    expect(online?.placeParts).toEqual(["Online"]);
    expect(hybrid?.placeParts).toEqual(["Amsterdam, Netherlands", "Hybrid"]);
  });

  it("uses the translated type, not an English-only code", () => {
    const [row] = present([item(5, { type: "deep_dive" })]);
    expect(row?.kind).toEqual({ type: "deep_dive", label: "Deep Dive" });
  });

  it("never repeats the community as host on its own page", () => {
    const [row] = present([item(6)]);
    expect(row?.host).toBeNull();
  });

  it("names a live Luma row by its venue text", () => {
    const [row] = present([
      item("luma-1", {
        slug: null,
        source: "luma",
        lumaUrl: "https://lu.ma/x",
        city: null,
        country: null,
        format: "in-person",
        location: "Keizersgracht 1, Amsterdam",
      }),
    ]);
    expect(row?.placeParts).toEqual(["Keizersgracht 1, Amsterdam"]);
    expect(row?.link).toEqual({ kind: "external", href: "https://lu.ma/x" });
  });

  it("says a Luma event's place is to be announced, never a guessed Online", () => {
    const [row] = present([
      item("luma-tba", {
        slug: null,
        source: "luma",
        lumaUrl: "https://lu.ma/tba",
        city: null,
        country: null,
        location: "TBA",
        // What normalizeLumaEvent sends for a TBA event.
        format: "online",
        displayFormat: null,
      }),
    ]);
    expect(row?.placeParts).toEqual(["Place to be announced"]);
  });

  it("uses the stated format of a Luma event that has one", () => {
    const [online] = present([
      item("luma-online", {
        slug: null,
        source: "luma",
        city: null,
        country: null,
        location: "Online",
        format: "online",
        displayFormat: "online",
      }),
    ]);
    expect(online?.placeParts).toEqual(["Online"]);
  });

  it("never flags a native event's place as to be announced", () => {
    const input = toCommunityEventRowInput(
      item(7, { format: null, city: null, location: "TBA" }),
      PUBLISHED,
    );
    expect(input.placeToBeAnnounced).toBe(false);
  });
});
