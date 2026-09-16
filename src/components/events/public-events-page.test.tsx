import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...p
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import {
  PUBLIC_EVENTS_H1,
  PUBLIC_EVENTS_HUB_HREF,
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
const WEEKDAY_MIGRATION_FILE = join(
  dir,
  "../../migrations/20260916a_curated_public_events_weekday.ts",
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

const INCOMPLETE: PublicEventCard = {
  id: "untitled-meetup",
  title: "Untitled meetup",
  date: "",
  online: false,
  city: null,
  url: "",
  why: { en: "", nl: "" },
  source: "hosted",
};

function jsonLdOf(container: HTMLElement): Record<string, unknown>[] {
  return [...container.querySelectorAll('script[type="application/ld+json"]')]
    .map((node) => {
      try {
        return JSON.parse(node.textContent ?? "") as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((row): row is Record<string, unknown> => row !== null);
}

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
    expect(src).not.toContain("listHostedPublicEventCards");
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
    expect(
      screen.getByRole("link", { name: en.publicEvents.eventPage }),
    ).toHaveAttribute("href", SAMPLE.url);
    expect(container.querySelector("ul")?.querySelectorAll("li")).toHaveLength(
      1,
    );
  });

  it("soft-omits blank date, place, blurb, and official link without inventing them", () => {
    const { container } = render(
      <PublicEventsPage
        locale="en"
        t={tFrom(en.publicEvents)}
        events={[INCOMPLETE]}
      />,
    );
    const entry = container.querySelector(
      "[data-public-event='untitled-meetup']",
    );
    expect(entry).not.toBeNull();
    expect(entry?.querySelector("time")).toBeNull();
    expect(entry?.textContent).not.toContain("Online");
    expect(entry?.textContent).not.toContain("·");
    expect(entry?.textContent).toContain("Untitled meetup");
    expect(
      screen.queryByRole("link", { name: en.publicEvents.eventPage }),
    ).toBeNull();
    expect(jsonLdOf(container)).toEqual([]);
    expect(container.textContent).not.toMatch(COUNT_COPY);
  });

  it("emits Event JSON-LD only for sourced date/place/title/URL rows", () => {
    const { container } = render(
      <PublicEventsPage
        locale="en"
        t={tFrom(en.publicEvents)}
        events={[SAMPLE, INCOMPLETE]}
      />,
    );
    const payloads = jsonLdOf(container);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      "@type": "Event",
      name: SAMPLE.title,
      startDate: SAMPLE.date,
      url: SAMPLE.url,
    });
    expect(payloads.some((row) => row["@type"] === "ItemList")).toBe(false);
    expect(JSON.stringify(payloads)).not.toMatch(COUNT_COPY);
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

  it("swaps Join to Open Hub for signed-in Hub members and keeps UTMs for guests", () => {
    const guest = render(
      <PublicEventsPage
        locale="en"
        t={tFrom(en.publicEvents)}
        events={[SAMPLE]}
      />,
    );
    expect(hrefsOf(guest.container)).toContain(PUBLIC_EVENTS_JOIN_HREF);
    expect(guest.container.textContent).toContain(en.publicEvents.lead);
    expect(guest.container.textContent).toMatch(
      /community sign-up, not an event ticket/,
    );
    guest.unmount();

    const { container } = render(
      <PublicEventsPage
        locale="en"
        t={tFrom(en.publicEvents)}
        events={[SAMPLE]}
        promoteJoin={false}
      />,
    );
    expect(hrefsOf(container)).not.toContain(PUBLIC_EVENTS_JOIN_HREF);
    expect(container.textContent).not.toContain(en.publicEvents.joinCta);
    expect(container.textContent).not.toMatch(
      /community sign-up|event ticket|Join the Hub/i,
    );
    expect(container.textContent).toContain(en.publicEvents.memberLead);
    expect(en.publicEvents.hubCta).toBe("Open Hub");
    expect(screen.getByRole("link", { name: "Open Hub" })).toHaveAttribute(
      "href",
      PUBLIC_EVENTS_HUB_HREF,
    );
    expect(screen.queryByRole("link", { name: /join/i })).toBeNull();
  });

  it("wires Events to the same per-request getSession source Startups uses", () => {
    const src = readFileSync(PAGE_FILE, "utf8");
    expect(src).toContain('dynamic = "force-dynamic"');
    expect(src).toContain("getSession");
    expect(src).toContain("shouldPromoteJoin(toHubAuthUser(session?.user))");
    expect(src).toContain("promoteJoin");
    expect(src).not.toMatch(/export const revalidate/);
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
    expect(existsSync(WEEKDAY_MIGRATION_FILE)).toBe(true);
    expect(readFileSync(MIGRATION_INDEX, "utf8")).toContain(
      "20260915a_curated_public_events",
    );
    expect(readFileSync(MIGRATION_INDEX, "utf8")).toContain(
      "20260916a_curated_public_events_weekday",
    );
    expect(existsSync(OPS_DOC)).toBe(true);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/AIT room/i);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/not a flat dump/i);
  });

  it("does not dump hosted CMS events onto the public list", () => {
    const queries = readFileSync(
      join(dir, "../../server/events/public-events-queries.ts"),
      "utf8",
    );
    expect(queries).toMatch(/listCuratedPublicEvents/);
    expect(queries).not.toMatch(
      /return mergePublicEvents\(\s*curated,\s*hosted/,
    );
    expect(queries).toMatch(
      /export async function listPublicEventCards[\s\S]*return listCuratedPublicEvents/,
    );
  });

  it("locks page metadata to the thin list", () => {
    expect(PUBLIC_EVENTS_PATH).toBe("/events");
    expect(PUBLIC_EVENTS_H1.length).toBeGreaterThan(0);
    expect(PUBLIC_EVENTS_META).not.toMatch(COUNT_COPY);
  });
});
