import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  PUBLIC_EVENTS_H1,
  PUBLIC_EVENTS_HUB_HREF,
  PUBLIC_EVENTS_JOIN_HREF,
  PUBLIC_EVENTS_META,
  PUBLIC_EVENTS_PATH,
  PUBLIC_EVENTS_WHY_MAX,
  isPublicEventUrl,
  isSourcedPublicEvent,
  listingEventJsonLd,
  listingEventsJsonLd,
  publicEventFromHosted,
  publicEventJsonLd,
  publicEventPlace,
  publicEventsJsonLd,
  sanitizePublicEventWhy,
  sortPublicEvents,
  sourcedListingEventPlace,
  type HostedEventInput,
  type PublicEventCard,
} from "./public-events";
import { CURATED_PUBLIC_EVENT_SEEDS } from "./public-events-seeds";

const dir = dirname(fileURLToPath(import.meta.url));

const BANNED_COUNT_FIELDS = [
  "attendees",
  "attendance",
  "rsvp",
  "spotsLeft",
  "maxAttendees",
  "spots",
] as const;

describe("public events contract", () => {
  it("lives at /events, not under investigations", () => {
    expect(PUBLIC_EVENTS_PATH).toBe("/events");
    expect(PUBLIC_EVENTS_PATH).not.toContain("investigations");
    expect(PUBLIC_EVENTS_PATH).not.toContain("ai-events");
    expect(
      existsSync(
        join(dir, "../../app/[locale]/investigations/ai-events/page.tsx"),
      ),
    ).toBe(false);
  });

  it("uses a hard www Join door with events UTMs", () => {
    expect(PUBLIC_EVENTS_JOIN_HREF).toBe(
      "https://www.aitcommunity.org/en/join?utm_source=aitcom&utm_medium=events&utm_campaign=ai-events",
    );
    const url = new URL(PUBLIC_EVENTS_JOIN_HREF);
    expect(url.origin).toBe("https://www.aitcommunity.org");
    expect(url.pathname).toBe("/en/join");
    expect(url.searchParams.get("utm_source")).toBe("aitcom");
    expect(url.searchParams.get("utm_medium")).toBe("events");
    expect(url.searchParams.get("utm_campaign")).toBe("ai-events");
    expect(PUBLIC_EVENTS_HUB_HREF).toBe("/communities/ait/forum");
  });

  it("keeps indexable copy without invented counts", () => {
    expect(PUBLIC_EVENTS_H1.length).toBeGreaterThan(0);
    expect(PUBLIC_EVENTS_META.length).toBeGreaterThan(0);
    expect(PUBLIC_EVENTS_META).not.toMatch(/\d+\s+(attendees|RSVPs?|spots)/i);
    expect(PUBLIC_EVENTS_WHY_MAX).toBeLessThanOrEqual(160);
  });
});

describe("isPublicEventUrl", () => {
  it("accepts real http(s) event pages and rejects fakes", () => {
    expect(isPublicEventUrl("https://worldsummit.ai/")).toBe(true);
    expect(isPublicEventUrl("http://example.com/meetup")).toBe(true);
    expect(isPublicEventUrl("javascript:alert(1)")).toBe(false);
    expect(isPublicEventUrl("/events/local-only")).toBe(false);
    expect(isPublicEventUrl("not-a-url")).toBe(false);
    expect(isPublicEventUrl("")).toBe(false);
  });
});

describe("publicEventPlace", () => {
  it("renders Online or the city, never both as a count", () => {
    expect(publicEventPlace({ online: true, city: null })).toBe("Online");
    expect(publicEventPlace({ online: false, city: "Amsterdam" })).toBe(
      "Amsterdam",
    );
  });

  it("soft-omits a blank in-person city instead of inventing Online", () => {
    expect(publicEventPlace({ online: false, city: null })).toBeNull();
    expect(publicEventPlace({ online: false, city: "   " })).toBeNull();
  });
});

function sourcedCard(
  overrides: Partial<PublicEventCard> = {},
): PublicEventCard {
  return {
    id: "world-summit-ai-amsterdam-2026",
    title: "World Summit AI Amsterdam 2026",
    date: "2026-10-07",
    online: false,
    city: "Amsterdam",
    url: "https://worldsummit.ai/",
    why: {
      en: "Flagship global AI summit in the Netherlands for builders to track.",
      nl: "Toonaangevende wereldwijde AI-top in Nederland voor bouwers.",
    },
    source: "curated",
    ...overrides,
  };
}

describe("isSourcedPublicEvent", () => {
  it("requires a real date, place, title, and URL", () => {
    expect(isSourcedPublicEvent(sourcedCard())).toBe(true);
    expect(
      isSourcedPublicEvent(sourcedCard({ online: true, city: null })),
    ).toBe(true);
    expect(isSourcedPublicEvent(sourcedCard({ title: "  " }))).toBe(false);
    expect(isSourcedPublicEvent(sourcedCard({ date: "soon" }))).toBe(false);
    expect(isSourcedPublicEvent(sourcedCard({ city: null }))).toBe(false);
    expect(
      isSourcedPublicEvent(sourcedCard({ url: "javascript:alert(1)" })),
    ).toBe(false);
  });
});

describe("publicEventJsonLd", () => {
  it("emits Event JSON-LD only when date, place, title, and URL are sourced", () => {
    const data = publicEventJsonLd(sourcedCard());
    expect(data).toMatchObject({
      "@type": "Event",
      name: "World Summit AI Amsterdam 2026",
      startDate: "2026-10-07",
      url: "https://worldsummit.ai/",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: { "@type": "Place", name: "Amsterdam" },
      description:
        "Flagship global AI summit in the Netherlands for builders to track.",
    });
    expect(data).not.toHaveProperty("attendee");
    expect(data).not.toHaveProperty("maximumAttendeeCapacity");
    expect(data).not.toHaveProperty("remainingAttendeeCapacity");

    expect(publicEventJsonLd(sourcedCard({ city: null }))).toBeNull();
    expect(publicEventJsonLd(sourcedCard({ title: "" }))).toBeNull();
    expect(publicEventJsonLd(sourcedCard({ url: "/local" }))).toBeNull();
  });

  it("soft-omits a blank blurb and never invents attendance", () => {
    const data = publicEventJsonLd(
      sourcedCard({ why: { en: "  ", nl: "  " } }),
    );
    expect(data?.["@type"]).toBe("Event");
    expect(data).not.toHaveProperty("description");
    expect(JSON.stringify(data)).not.toMatch(
      /attendee|RSVP|spots?\s+left|maximumAttendeeCapacity/i,
    );
  });
});

describe("publicEventsJsonLd", () => {
  it("returns sourced Event entries, not a flat ItemList dump", () => {
    const rows = publicEventsJsonLd([
      sourcedCard(),
      sourcedCard({ id: "broken", city: null, url: "not-a-url" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["@type"]).toBe("Event");
    expect(rows.some((row) => row["@type"] === "ItemList")).toBe(false);
  });
});

function hostedListingEvent(
  overrides: Partial<HostedEventInput> = {},
): HostedEventInput {
  return {
    id: 12,
    title: "World Summit AI Amsterdam 2026",
    slug: "world-summit-ai-amsterdam-2026",
    date: "2026-10-07T00:00:00.000Z",
    format: "in-person",
    city: "Amsterdam",
    location: "RAI Amsterdam",
    sourceUrl: "https://worldsummit.ai/",
    summary:
      "Flagship global AI summit in the Netherlands for builders to track.",
    ...overrides,
  };
}

describe("sourcedListingEventPlace", () => {
  it("keeps a real city or venue and never invents Online as a city", () => {
    expect(
      sourcedListingEventPlace({
        city: "Amsterdam",
        location: "RAI Amsterdam",
        format: "in-person",
      }),
    ).toBe("Amsterdam");
    expect(
      sourcedListingEventPlace({
        city: null,
        location: "Pakhuis de Zwijger",
        format: "in-person",
      }),
    ).toBe("Pakhuis de Zwijger");
    expect(
      sourcedListingEventPlace({
        city: null,
        location: "Online",
        format: "online",
      }),
    ).toBeNull();
    expect(
      sourcedListingEventPlace({
        city: "  Online  ",
        location: "Online",
        format: "hybrid",
      }),
    ).toBeNull();
    expect(
      sourcedListingEventPlace({
        city: null,
        location: "TBA",
        format: "in-person",
      }),
    ).toBeNull();
    expect(
      sourcedListingEventPlace({
        city: "   ",
        location: "   ",
        format: "in-person",
      }),
    ).toBeNull();
  });
});

describe("listingEventJsonLd", () => {
  it("emits Event JSON-LD only when name, startDate, url, and a real place are sourced", () => {
    const data = listingEventJsonLd(hostedListingEvent(), "en");
    expect(data).toMatchObject({
      "@type": "Event",
      name: "World Summit AI Amsterdam 2026",
      startDate: "2026-10-07",
      url: "https://worldsummit.ai/",
      location: { "@type": "Place", name: "Amsterdam" },
      description:
        "Flagship global AI summit in the Netherlands for builders to track.",
    });
    expect(data).not.toHaveProperty("endDate");
    expect(data).not.toHaveProperty("attendee");
    expect(data).not.toHaveProperty("maximumAttendeeCapacity");
    expect(data).not.toHaveProperty("remainingAttendeeCapacity");
    expect(data).not.toHaveProperty("eventAttendanceMode");
    expect(JSON.stringify(data)).not.toMatch(
      /attendee|RSVP|spots?\s+left|Online/i,
    );

    expect(
      listingEventJsonLd(hostedListingEvent({ title: "  " }), "en"),
    ).toBeNull();
    expect(
      listingEventJsonLd(hostedListingEvent({ date: "soon" }), "en"),
    ).toBeNull();
    expect(
      listingEventJsonLd(
        hostedListingEvent({
          slug: "",
          sourceUrl: "javascript:alert(1)",
        }),
        "en",
      ),
    ).toBeNull();
    expect(
      listingEventJsonLd(
        hostedListingEvent({
          city: null,
          location: "Online",
          format: "online",
        }),
        "en",
      ),
    ).toBeNull();
  });

  it("soft-omits a blank blurb and never invents attendance or end dates", () => {
    const data = listingEventJsonLd(
      hostedListingEvent({
        summary: "  ",
        maxAttendees: 80,
      }),
      "nl",
    );
    expect(data?.["@type"]).toBe("Event");
    expect(data).not.toHaveProperty("description");
    expect(data).not.toHaveProperty("endDate");
    expect(JSON.stringify(data)).not.toMatch(
      /attendee|RSVP|spots?\s+left|maximumAttendeeCapacity|80/i,
    );
  });

  it("falls back to the canonical www event page when sourceUrl is missing", () => {
    const data = listingEventJsonLd(
      hostedListingEvent({ sourceUrl: null }),
      "nl",
    );
    expect(data?.url).toBe(
      "https://www.aitcommunity.org/nl/events/world-summit-ai-amsterdam-2026",
    );
  });
});

describe("listingEventsJsonLd", () => {
  it("returns sourced Event entries only, not a flat ItemList dump", () => {
    const rows = listingEventsJsonLd(
      [
        hostedListingEvent(),
        hostedListingEvent({
          id: 13,
          title: "Hollow webinar",
          slug: "hollow-webinar",
          city: null,
          location: "Online",
          format: "online",
          sourceUrl: "https://example.com/webinar",
        }),
      ],
      "en",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["@type"]).toBe("Event");
    expect(rows[0]?.name).toBe("World Summit AI Amsterdam 2026");
    expect(rows.some((row) => row["@type"] === "ItemList")).toBe(false);
  });
});

describe("sanitizePublicEventWhy", () => {
  it("keeps a one-liner and never invents copy", () => {
    expect(sanitizePublicEventWhy("  Meet the builders.  ")).toBe(
      "Meet the builders.",
    );
    expect(sanitizePublicEventWhy("")).toBe("");
    expect(
      sanitizePublicEventWhy("x".repeat(PUBLIC_EVENTS_WHY_MAX + 20)).length,
    ).toBe(PUBLIC_EVENTS_WHY_MAX);
  });
});

describe("sortPublicEvents", () => {
  it("lists upcoming dates first, then past, without inventing rows", () => {
    const rows: PublicEventCard[] = [
      {
        id: "past",
        title: "Past",
        date: "2026-01-01",
        online: true,
        city: null,
        url: "https://example.com/past",
        why: { en: "Already happened.", nl: "Al geweest." },
        source: "curated",
      },
      {
        id: "soon",
        title: "Soon",
        date: "2026-12-01",
        online: false,
        city: "Rotterdam",
        url: "https://example.com/soon",
        why: { en: "Coming up.", nl: "Binnenkort." },
        source: "curated",
      },
    ];
    expect(sortPublicEvents(rows, "2026-09-15").map((row) => row.id)).toEqual([
      "soon",
      "past",
    ]);
  });
});

describe("publicEventFromHosted", () => {
  it("maps a hosted event to the thin fields and omits counts", () => {
    const card = publicEventFromHosted(
      {
        id: 9,
        title: "Hub workshop",
        slug: "hub-workshop",
        date: "2026-11-02T00:00:00.000Z",
        format: "in-person",
        city: "Utrecht",
        location: "Utrecht",
        sourceUrl: "https://lu.ma/hub-workshop",
        summary: "Hands-on agent workshop for members.",
        maxAttendees: 80,
      },
      "en",
    );
    expect(card).toMatchObject({
      title: "Hub workshop",
      date: "2026-11-02",
      online: false,
      city: "Utrecht",
      url: "https://lu.ma/hub-workshop",
      why: {
        en: "Hands-on agent workshop for members.",
        nl: "Hands-on agent workshop for members.",
      },
      source: "hosted",
    });
    expect(card && "maxAttendees" in card).toBe(false);
    expect(card && "attendees" in card).toBe(false);
    expect(card && "rsvp" in card).toBe(false);
  });

  it("falls back to the canonical www event page when sourceUrl is missing", () => {
    const card = publicEventFromHosted(
      {
        id: 3,
        title: "Community night",
        slug: "community-night",
        date: "2026-11-10",
        format: "online",
        city: null,
        location: "Online",
        sourceUrl: null,
        summary: null,
      },
      "nl",
    );
    expect(card?.url).toBe(
      "https://www.aitcommunity.org/nl/events/community-night",
    );
    expect(card?.online).toBe(true);
    expect(card?.why).toEqual({ en: "", nl: "" });
  });

  it("drops hosted rows that cannot form a real URL", () => {
    expect(
      publicEventFromHosted(
        {
          id: 1,
          title: "Broken",
          slug: "",
          date: "2026-11-01",
          sourceUrl: "javascript:alert(1)",
        },
        "en",
      ),
    ).toBeNull();
  });
});

describe("curated public event seeds", () => {
  it("only includes real public URLs and never attendance fields", () => {
    for (const seed of CURATED_PUBLIC_EVENT_SEEDS) {
      expect(isPublicEventUrl(seed.url)).toBe(true);
      expect(seed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(seed.why.en.length).toBeGreaterThan(0);
      expect(seed.why.en.length).toBeLessThanOrEqual(PUBLIC_EVENTS_WHY_MAX);
      expect(seed.why.nl.length).toBeGreaterThan(0);
      expect(seed.why.nl.length).toBeLessThanOrEqual(PUBLIC_EVENTS_WHY_MAX);
      expect(seed.online || Boolean(seed.city)).toBe(true);
      expect(seed).not.toHaveProperty("endDate");
      for (const field of BANNED_COUNT_FIELDS) {
        expect(seed).not.toHaveProperty(field);
      }
    }
  });

  it("keeps World Summit and the weekday +5 official pages", () => {
    expect(CURATED_PUBLIC_EVENT_SEEDS.map((seed) => seed.id)).toEqual([
      "ai-summit-barcelona-2026",
      "lisbon-ai-2026",
      "world-summit-ai-amsterdam-2026",
      "ai-engineer-new-york-2026",
      "nvidia-gtc-berlin-2026",
      "ai-engineer-code-summit-2026",
    ]);
    const byId = Object.fromEntries(
      CURATED_PUBLIC_EVENT_SEEDS.map((seed) => [seed.id, seed]),
    );
    expect(byId["ai-summit-barcelona-2026"]).toMatchObject({
      title: "AI Summit Barcelona",
      date: "2026-09-22",
      city: "Barcelona",
      url: "https://aisummitbarcelona.com/",
    });
    expect(byId["lisbon-ai-2026"]).toMatchObject({
      title: "Lisbon AI",
      date: "2026-09-23",
      city: "Lisbon",
      url: "https://lisbonai.org/",
    });
    expect(byId["world-summit-ai-amsterdam-2026"]).toMatchObject({
      title: "World Summit AI Amsterdam 2026",
      date: "2026-10-07",
      city: "Amsterdam",
      url: "https://worldsummit.ai/",
    });
    expect(byId["ai-engineer-new-york-2026"]).toMatchObject({
      title: "AI Engineer New York",
      date: "2026-10-12",
      city: "New York",
      url: "https://www.ai.engineer/nyc/2026",
    });
    expect(byId["nvidia-gtc-berlin-2026"]).toMatchObject({
      title: "NVIDIA GTC Berlin",
      date: "2026-10-20",
      city: "Berlin",
      url: "https://www.nvidia.com/en-eu/gtc/",
    });
    expect(byId["ai-engineer-code-summit-2026"]).toMatchObject({
      title: "AI Engineer CODE Summit",
      date: "2026-11-10",
      city: "San Francisco",
      url: "https://www.ai.engineer/code/2026",
    });
  });
});
