import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import {
  PUBLIC_EVENTS_H1,
  PUBLIC_EVENTS_JOIN_HREF,
  PUBLIC_EVENTS_META,
  PUBLIC_EVENTS_PATH,
  type PublicEventCard,
} from "@/lib/events/public-events";
import { PublicEventsPage } from "./public-events-page";

const dir = dirname(fileURLToPath(import.meta.url));
const appLocale = join(dir, "../../app/[locale]");
const PAGE_FILE = join(appLocale, "events/page.tsx");
const INVESTIGATION_FILE = join(appLocale, "investigations/ai-events/page.tsx");
const SITEMAP_FILE = join(dir, "../../app/sitemap.ts");
const SITEMAP_TEST_FILE = join(dir, "../../app/sitemap.test.ts");
const NAV_FILE = join(dir, "../navbar.tsx");
const SCHEMA_FILE = join(dir, "../../server/db/schema.ts");
const MIGRATION_FILE = join(
  dir,
  "../../migrations/20260915a_curated_public_events.ts",
);
const MIGRATION_INDEX = join(dir, "../../migrations/index.ts");
const OPS_DOC = join(dir, "../../../docs/ops/curated-public-events.md");

const SAMPLE: PublicEventCard = {
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
};

function tFrom(dict: Record<string, string>) {
  return (key: string) => dict[key] ?? key;
}

function hrefsOf(container: HTMLElement) {
  return [...container.querySelectorAll("a")].map((node) =>
    node.getAttribute("href"),
  );
}

const COUNT_COPY =
  /\b(\d+|no)\s+(attendees?|RSVPs?|spots?(?:\s+left)?|registrations?)\b/i;

describe("public events route", () => {
  it("is the locale /events page, not an investigations path", () => {
    expect(existsSync(PAGE_FILE)).toBe(true);
    expect(existsSync(INVESTIGATION_FILE)).toBe(false);
    const src = readFileSync(PAGE_FILE, "utf8");
    expect(src).toContain("PUBLIC_EVENTS_PATH");
    expect(src).toContain("localeAlternates");
    expect(src).toContain("PublicEventsPage");
    expect(src).toContain("robots: { index: true, follow: true }");
    expect(src).not.toContain("investigations/ai-events");
    expect(src).not.toContain("EventsFilterBar");
    expect(src).not.toContain("EventsMap");
    expect(src).not.toContain("maxAttendees");
    expect(src).not.toContain("aitFitScore");
  });
});

describe("PublicEventsPage", () => {
  it("renders date, city or online, real URL, and one-line why", () => {
    const { container } = render(
      <PublicEventsPage
        locale="en"
        t={tFrom(en.publicEvents)}
        events={[SAMPLE]}
      />,
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      en.publicEvents.title,
    );
    expect(container.textContent).toContain("2026-10-07");
    expect(container.textContent).toContain("Amsterdam");
    expect(container.textContent).toContain(SAMPLE.why.en);
    expect(hrefsOf(container)).toContain("https://worldsummit.ai/");
    expect(hrefsOf(container)).toContain(PUBLIC_EVENTS_JOIN_HREF);
    expect(hrefsOf(container)).not.toContain("/en/join");
    expect(container.textContent).not.toMatch(COUNT_COPY);
    expect(container.querySelector("[data-event-attendees]")).toBeNull();
  });

  it("soft-fails empty without inventing rows", () => {
    const { container } = render(
      <PublicEventsPage locale="en" t={tFrom(en.publicEvents)} events={[]} />,
    );
    expect(container.textContent).toContain(en.publicEvents.empty);
    expect(container.querySelectorAll("[data-public-event]")).toHaveLength(0);
    expect(hrefsOf(container)).toContain(PUBLIC_EVENTS_JOIN_HREF);
    expect(container.textContent).not.toMatch(COUNT_COPY);
  });

  it("keeps Dutch copy on the same /events path", () => {
    const { container } = render(
      <PublicEventsPage
        locale="nl"
        t={tFrom(nl.publicEvents)}
        events={[SAMPLE]}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      nl.publicEvents.title,
    );
    expect(container.textContent).toContain(SAMPLE.why.nl);
    expect(hrefsOf(container)).toContain(PUBLIC_EVENTS_JOIN_HREF);
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

  it("has a curated store + ops note for parked AIT-room events", () => {
    expect(existsSync(SCHEMA_FILE)).toBe(true);
    expect(readFileSync(SCHEMA_FILE, "utf8")).toContain("curatedPublicEvents");
    expect(existsSync(MIGRATION_FILE)).toBe(true);
    expect(readFileSync(MIGRATION_INDEX, "utf8")).toContain(
      "20260915a_curated_public_events",
    );
    expect(existsSync(OPS_DOC)).toBe(true);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/AIT room/i);
  });

  it("locks page metadata to the thin list", () => {
    expect(PUBLIC_EVENTS_PATH).toBe("/events");
    expect(PUBLIC_EVENTS_H1.length).toBeGreaterThan(0);
    expect(PUBLIC_EVENTS_META).not.toMatch(COUNT_COPY);
  });
});
