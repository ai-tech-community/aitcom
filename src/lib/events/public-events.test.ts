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
  publicEventFromHosted,
  publicEventPlace,
  sanitizePublicEventWhy,
  sortPublicEvents,
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
      expect(seed.online || Boolean(seed.city)).toBe(true);
      for (const field of BANNED_COUNT_FIELDS) {
        expect(seed).not.toHaveProperty(field);
      }
    }
  });
});
