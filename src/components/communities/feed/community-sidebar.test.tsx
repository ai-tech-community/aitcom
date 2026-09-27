import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";

const m = vi.hoisted(() => ({
  events: [] as unknown[],
  eventsLoading: false,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    events: {
      getCommunityEvents: {
        useQuery: () => ({
          data: m.eventsLoading ? undefined : m.events,
          isLoading: m.eventsLoading,
        }),
      },
    },
    forum: { getIdeas: { useQuery: () => ({ data: [] }) } },
    links: { list: { useQuery: () => ({ data: [] }) } },
    communities: { getBySlug: { useQuery: () => ({ data: undefined }) } },
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CommunitySidebar, SIDEBAR_EVENTS_SHOWN } from "./community-sidebar";

const NOW = new Date("2026-09-27T10:00:00.000Z");

function ev(id: number | string, overrides: Record<string, unknown> = {}) {
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

function renderSidebar(locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <CommunitySidebar slug="ai-amsterdam" now={NOW} />
    </NextIntlClientProvider>,
  );
}

function eventsSection() {
  return document.querySelector<HTMLElement>(
    "[data-sidebar-section='events']",
  )!;
}

beforeEach(() => {
  m.eventsLoading = false;
  m.events = [
    ev(1, {
      title: "Agents Hackathon",
      type: "hackathon",
      date: "2026-10-10T00:00:00.000Z",
      startTime: "10:00",
    }),
    ev(2, { title: "Last spring", date: "2026-03-01T00:00:00.000Z" }),
    ev(3, {
      title: "Prompting workshop",
      type: "workshop",
      format: "online",
      city: null,
      country: null,
      location: "Online",
      date: "2026-10-03",
      startTime: null,
      endTime: null,
    }),
    ev("luma-x", {
      title: "Friday drinks",
      slug: null,
      source: "luma",
      lumaUrl: "https://lu.ma/drinks",
      city: null,
      country: null,
      location: "Keizersgracht 1, Amsterdam",
      date: "2026-09-30",
      startTime: "17:00",
      endTime: null,
    }),
    ev(5, { title: "Much later", date: "2026-12-01T00:00:00.000Z" }),
  ];
});

describe("CommunitySidebar — upcoming events", () => {
  it("lists the next few upcoming events as compact rows, soonest first", () => {
    renderSidebar();
    const links = within(eventsSection())
      .getAllByRole("listitem")
      .map((li) => li.querySelector("a"));
    expect(links).toHaveLength(SIDEBAR_EVENTS_SHOWN);
    expect(links.map((a) => a?.getAttribute("href"))).toEqual([
      "https://lu.ma/drinks",
      "/events/event-3",
      "/events/event-1",
    ]);
  });

  it("gives each row its event-local day and time, place and type", () => {
    renderSidebar();
    const hackathon = screen.getByRole("link", { name: /Agents Hackathon/ });
    expect(hackathon.querySelector("time")).toHaveAttribute(
      "dateTime",
      "2026-10-10",
    );
    expect(hackathon.querySelector("time")?.textContent).toBe(
      "10 Oct · 10:00 CEST",
    );
    expect(hackathon.textContent).toContain(
      "Amsterdam, Netherlands · Hackathon",
    );
    const workshop = screen.getByRole("link", { name: /Prompting workshop/ });
    expect(workshop.querySelector("time")?.textContent).toBe("03 Oct");
    expect(workshop.textContent).toContain("Online · Workshop");
  });

  it("opens a live Luma row on Luma, never at /events/null", () => {
    renderSidebar();
    const luma = screen.getByRole("link", { name: /Friday drinks/ });
    expect(luma).toHaveAttribute("target", "_blank");
    expect(document.body.innerHTML).not.toContain("/events/null");
  });

  it("links to all the community's events with a readable label", () => {
    renderSidebar();
    expect(
      within(eventsSection()).getByRole("link", { name: /^View all/ }),
    ).toHaveAttribute("href", "/communities/ai-amsterdam/events");
    expect(eventsSection().textContent).not.toContain("+");
  });

  it("speaks Dutch", () => {
    renderSidebar("nl");
    const workshop = screen.getByRole("link", { name: /Prompting workshop/ });
    expect(workshop.querySelector("time")?.textContent).toBe("03 okt");
    expect(
      within(eventsSection()).getByRole("link", { name: /^Alles bekijken/ }),
    ).toBeInTheDocument();
  });

  it("leaves the section out when nothing is coming up", () => {
    m.events = [ev(2, { date: "2026-03-01T00:00:00.000Z" })];
    renderSidebar();
    expect(eventsSection()).toBeNull();
  });

  it("formats nothing on its own", () => {
    const source = readFileSync(
      join(__dirname, "community-sidebar.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/typeLabels|function formatDate|new Date\(/);
  });
});
