import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import {
  PUBLIC_EVENTS_H1,
  PUBLIC_EVENTS_HUB_HREF,
  PUBLIC_EVENTS_JOIN_HREF,
  PUBLIC_EVENTS_META,
  PUBLIC_EVENTS_PATH,
} from "@/lib/events/public-events";

const dir = dirname(fileURLToPath(import.meta.url));
const appLocale = join(dir, "../../app/[locale]");
const PAGE_FILE = join(appLocale, "events/page.tsx");
const SLUG_PAGE_FILE = join(appLocale, "events/[slug]/page.tsx");
const INVESTIGATION_FILE = join(appLocale, "investigations/ai-events/page.tsx");
const SITEMAP_FILE = join(dir, "../../app/sitemap.ts");
const SITEMAP_TEST_FILE = join(dir, "../../app/sitemap.test.ts");
const NAV_FILE = join(dir, "../navbar.tsx");
const SCHEMA_FILE = join(dir, "../../server/db/schema.ts");
const MIGRATION_FILE = join(
  dir,
  "../../migrations/20260915a_curated_public_events.ts",
);
const WEEKDAY_MIGRATION_FILE = join(
  dir,
  "../../migrations/20260916a_curated_public_events_weekday.ts",
);
const MIGRATION_INDEX = join(dir, "../../migrations/index.ts");
const OPS_DOC = join(dir, "../../../docs/ops/curated-public-events.md");
const QUERIES_FILE = join(dir, "../../server/events/public-events-queries.ts");

const COUNT_COPY =
  /\b(\d+|no)\s+(attendees?|RSVPs?|spots?(?:\s+left)?|registrations?)\b/i;

describe("public events route", () => {
  it("is the locale /events page, not an investigations path", () => {
    expect(existsSync(PAGE_FILE)).toBe(true);
    expect(existsSync(INVESTIGATION_FILE)).toBe(false);
    const src = readFileSync(PAGE_FILE, "utf8");
    expect(src).toContain("PUBLIC_EVENTS_PATH");
    expect(src).toContain("localeAlternates");
    expect(src).toContain("robots: { index: true, follow: true }");
    expect(src).not.toContain("investigations/ai-events");
  });

  it("restores the fat CMS listing (filters / map / cards), not the thin bar", () => {
    const src = readFileSync(PAGE_FILE, "utf8");
    expect(src).toContain("EventsFilterBar");
    expect(src).toContain("EventsMap");
    expect(src).toContain('collection: "events"');
    expect(src).toContain("discoverySource");
    expect(src).not.toContain("PublicEventsPage");
    expect(src).not.toContain("listPublicEventCards");
    expect(src).not.toContain("listCuratedPublicEvents");
    expect(src).not.toContain("curatedPublicEventCards");
    expect(src).not.toMatch(/maxAttendees|spotsLeft|spots remaining|RSVP/i);
  });

  it("keeps /events/[slug] detail routes", () => {
    expect(existsSync(SLUG_PAGE_FILE)).toBe(true);
    const src = readFileSync(PAGE_FILE, "utf8");
    expect(src).toContain("`/events/${event.slug}`");
  });
});

describe("Join chrome", () => {
  it("wires Events to the same per-request getSession source Startups uses", () => {
    const src = readFileSync(PAGE_FILE, "utf8");
    expect(src).toContain('dynamic = "force-dynamic"');
    expect(src).toContain("getSession");
    expect(src).toContain("shouldPromoteJoin(toHubAuthUser(session?.user))");
    expect(src).toContain("PromoteJoinCta");
    expect(src).toContain("PUBLIC_EVENTS_JOIN_HREF");
    expect(src).toContain('t("listingLead")');
    expect(src).toContain('t("listingMemberLead")');
    expect(src).not.toMatch(/export const revalidate/);
  });

  it("keeps the hard www Join door with events UTMs", () => {
    expect(PUBLIC_EVENTS_JOIN_HREF).toBe(
      "https://www.aitcommunity.org/en/join?utm_source=aitcom&utm_medium=events&utm_campaign=ai-events",
    );
    expect(PUBLIC_EVENTS_HUB_HREF).toBe("/communities/ait/forum");
    expect(en.events.joinCta).toBe("Join the Hub");
    expect(en.events.hubCta).toBe("Open Hub");
    expect(nl.events.joinCta).toBe("Word lid van de Hub");
    expect(nl.events.hubCta).toBe("Open Hub");
    expect(en.events.listingLead).toMatch(
      /community sign-up, not an event ticket/,
    );
    expect(nl.events.listingLead).toMatch(/community-aanmelding/);
  });
});

describe("public events site integration", () => {
  it("is in the sitemap static pages with a www canonical helper", () => {
    const sitemap = readFileSync(SITEMAP_FILE, "utf8");
    const sitemapTest = readFileSync(SITEMAP_TEST_FILE, "utf8");
    expect(sitemap).toContain('"/events"');
    expect(sitemapTest).toContain('"/events"');
    expect(sitemap).not.toContain("/investigations/ai-events");
  });

  it("keeps Events in the primary nav", () => {
    const navbar = readFileSync(NAV_FILE, "utf8");
    expect(navbar).toMatch(/href:\s*"\/events"[\s\S]*primary:\s*true/);
    expect(en.nav.events).toBe("Events");
    expect(nl.nav.events).toBe("Evenementen");
  });

  it("keeps the curated store parked and documents the fat CMS listing", () => {
    expect(existsSync(SCHEMA_FILE)).toBe(true);
    expect(readFileSync(SCHEMA_FILE, "utf8")).toContain("curatedPublicEvents");
    expect(existsSync(MIGRATION_FILE)).toBe(true);
    expect(existsSync(WEEKDAY_MIGRATION_FILE)).toBe(true);
    expect(readFileSync(MIGRATION_INDEX, "utf8")).toContain(
      "20260915a_curated_public_events",
    );
    expect(readFileSync(MIGRATION_INDEX, "utf8")).toContain(
      "20260916a_curated_public_events_weekday",
    );
    expect(existsSync(OPS_DOC)).toBe(true);
    const ops = readFileSync(OPS_DOC, "utf8");
    expect(ops).toMatch(/fat CMS listing/i);
    expect(ops).toMatch(/not the public listing/i);
    expect(readFileSync(QUERIES_FILE, "utf8")).toMatch(
      /Parked curated store[\s\S]*listPublicEventCards[\s\S]*listCuratedPublicEvents/,
    );
  });

  it("locks page metadata to the fat listing without invented counts", () => {
    expect(PUBLIC_EVENTS_PATH).toBe("/events");
    expect(PUBLIC_EVENTS_H1.length).toBeGreaterThan(0);
    expect(PUBLIC_EVENTS_META).not.toMatch(COUNT_COPY);
    expect(en.events.listingLead).not.toMatch(COUNT_COPY);
    expect(nl.events.listingLead).not.toMatch(COUNT_COPY);
  });
});
