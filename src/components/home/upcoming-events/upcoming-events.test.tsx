import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";

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

import { UpcomingEvents } from "./upcoming-events";
import type { UpcomingEventInput } from "./upcoming-event-rows";

const NOW = new Date("2026-09-27T10:00:00.000Z");

const EVENTS: UpcomingEventInput[] = [
  {
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
  },
  {
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
  },
  {
    id: 3,
    slug: "prompting-workshop",
    title: "Prompting workshop",
    type: "workshop",
    format: "online",
    date: "2026-10-14",
    startTime: null,
    timezone: "Europe/Amsterdam",
    location: "Online",
  },
];

function renderIn(events: UpcomingEventInput[], locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <UpcomingEvents events={events} now={NOW} />
    </NextIntlClientProvider>,
  );
}

function section() {
  return screen.getByRole("region", {
    name: /upcoming events|aankomende evenementen/i,
  });
}

/** The accessible name Testing Library computes for one element. */
function accessibleNameOf(target: HTMLElement): string {
  let found = "";
  screen.getByRole(target.getAttribute("role") ?? "link", {
    name: (name, el) => {
      if (el === target) found = name;
      return el === target;
    },
  });
  return found;
}

/** Every element that paints Signal Orange (text, fill or border). */
function orangeElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll("*")).filter((el) =>
    /(^|\s)(text|bg|border|fill|stroke)-primary(\/\d+)?(\s|$)/.test(
      el.getAttribute("class") ?? "",
    ),
  );
}

describe("UpcomingEvents", () => {
  it("renders one row link per event, in order, to its event page", () => {
    renderIn(EVENTS);
    const list = within(section()).getByRole("list");
    const rows = within(list).getAllByRole("link");
    expect(rows.map((a) => a.getAttribute("href"))).toEqual([
      "/events/the-ai-conference-2026",
      "/events/agents-hackathon",
      "/events/prompting-workshop",
    ]);
  });

  it("names each row by its own visible words, title first", () => {
    renderIn(EVENTS);
    expect(
      screen.getByRole("link", {
        name: "The AI Conference 2026, San Francisco, United States, 29 Sep, Tue, 09:00 PDT, Next up, Meetup",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Agents Hackathon, Utrecht, Netherlands, by AIT Community Netherlands, 05 Oct, Mon, 10:00 CEST, Hackathon",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Prompting workshop, Online, 14 Oct, Wed, Workshop",
      }),
    ).toBeInTheDocument();
  });

  it("has no aria-label: every visible word is in the name, nothing replaced", () => {
    renderIn(EVENTS);
    const rows = within(within(section()).getByRole("list")).getAllByRole(
      "link",
    );
    for (const row of rows) {
      expect(row).not.toHaveAttribute("aria-label");
      expect(row).not.toHaveAttribute("aria-labelledby");
      const name = accessibleNameOf(row).toLowerCase();
      // What a voice user reads off the screen, e.g. "05 OCT" or "10:00 CEST".
      const visible = Array.from(
        row.querySelectorAll<HTMLElement>("span, time"),
      )
        .filter(
          (el) =>
            !el.closest("[aria-hidden='true']") &&
            !el.classList.contains("sr-only") &&
            el.children.length === 0,
        )
        .map((el) => el.textContent?.trim().toLowerCase() ?? "")
        .filter(Boolean);
      expect(visible.length).toBeGreaterThan(3);
      for (const words of visible) expect(name).toContain(words);
    }
  });

  it("shows the date block in the event's own zone", () => {
    renderIn(EVENTS);
    const first = screen.getByRole("link", { name: /^The AI Conference/ });
    const time = first.querySelector("time");
    expect(time).toHaveAttribute("dateTime", "2026-09-29");
    expect(time?.textContent).toBe("29 Sep, Tue, 09:00 PDT");
    expect(time).toHaveClass("uppercase");
    expect(first.textContent).toContain("San Francisco, United States");
  });

  it("marks only the next event, with the section's one orange mark", () => {
    renderIn(EVENTS);
    const markers = screen.getAllByTestId("next-marker");
    expect(markers).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: /^The AI Conference/ }),
    ).toContainElement(markers[0] ?? null);
    expect(markers[0]?.textContent).toContain("Next up");

    const orange = orangeElements(section());
    expect(orange).toHaveLength(1);
    expect(orange[0]).toHaveAttribute("aria-hidden", "true");
    expect(markers[0]).toContainElement(orange[0] as HTMLElement);
  });

  it("gives a hackathon a stronger outline badge, never an orange row", () => {
    renderIn(EVENTS);
    const row = screen.getByRole("link", { name: /^Agents Hackathon/ });
    expect(row.className).not.toMatch(/bg-primary|text-primary-foreground/);
    const badge = row.querySelector('[data-kind="hackathon"]');
    expect(badge?.textContent).toBe("Hackathon");
    expect(badge?.className).toMatch(/border-foreground/);
    expect(row.textContent).toContain("by AIT Community Netherlands");
  });

  it("shows the type the data says, with no decorative plus", () => {
    renderIn(EVENTS);
    const kinds = Array.from(
      section().querySelectorAll("[data-kind]"),
      (el) => el.textContent,
    );
    expect(kinds).toEqual(["Meetup", "Hackathon", "Workshop"]);
    expect(section().textContent).not.toMatch(/\+/);
    expect(section().textContent).not.toMatch(/DATE|NAME|TYPE/);
  });

  it("speaks Dutch", () => {
    renderIn(EVENTS, "nl");
    expect(
      screen.getByRole("region", { name: nl.events.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Agents Hackathon, Utrecht, Netherlands, door AIT Community Netherlands, 05 okt, ma, 10:00 CEST, Hackathon",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("next-marker").textContent).toContain(
      nl.hero.board.label,
    );
    expect(
      screen.getByRole("link", { name: /Alle Evenementen/ }),
    ).toHaveAttribute("href", "/events");
  });

  it("keeps the empty state and the link to all events", () => {
    renderIn([], "nl");
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText(nl.events.noEvents)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Alle Evenementen/ }),
    ).toHaveAttribute("href", "/events");
    expect(orangeElements(section())).toHaveLength(0);
  });
});

describe("UpcomingEvents — translations", () => {
  const KEYS = [
    "title",
    "viewAll",
    "noEvents",
    "online",
    "formatHybrid",
    "formatInPerson",
    "hostedBy",
    "eventTypeMeetup",
    "eventTypeWorkshop",
    "eventTypeHackathon",
    "eventTypeDeepDive",
  ] as const;

  it.each([
    ["en", en],
    ["nl", nl],
  ] as const)("has every key it uses in %s", (locale, m) => {
    for (const key of KEYS) {
      expect(m.events[key], `${locale} events.${key}`).toBeTruthy();
    }
    expect(m.events.hostedBy).toContain("{name}");
    expect(m.hero.board.label).toBeTruthy();
  });

  it("has the same events keys in both locales", () => {
    expect(Object.keys(nl.events).sort()).toEqual(
      Object.keys(en.events).sort(),
    );
  });

  it("is the homepage's events section", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/[locale]/page.tsx"),
      "utf8",
    );
    expect(page).toContain("<UpcomingEvents events={upcomingEventRows} />");
    expect(page).not.toMatch(/typeLabels|function formatDate/);
    // Rows come through the tested mapper and the ordering guard.
    expect(page).toContain("toUpcomingEventInput(event, hostNames)");
    expect(page).toContain(
      "completeUpcomingCandidates(eventCandidates, UPCOMING_EVENT_CANDIDATES)",
    );
    expect(page).toContain("limit: UPCOMING_EVENT_CANDIDATES");
  });
});
