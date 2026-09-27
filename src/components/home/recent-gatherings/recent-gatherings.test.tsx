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

import { RecentGatherings } from "./recent-gatherings";
import type { EventRowInput } from "@/components/events/rows/event-rows";

const NOW = new Date("2026-09-27T12:00:00.000Z");

function event(
  id: number,
  overrides: Partial<EventRowInput> = {},
): EventRowInput {
  return {
    id,
    slug: `event-${id}`,
    title: `Gathering ${id}`,
    type: "workshop",
    date: "2026-09-20T00:00:00.000Z",
    timezone: "Europe/Amsterdam",
    city: "Amsterdam",
    country: "Netherlands",
    ...overrides,
  };
}

function renderIn(events: EventRowInput[], locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <RecentGatherings events={events} now={NOW} />
    </NextIntlClientProvider>,
  );
}

describe("RecentGatherings", () => {
  it("lists real past gatherings with date, host and a link to each", () => {
    renderIn([
      event(1, { host: "AI Amsterdam" }),
      event(2, { date: "2025-12-02T00:00:00.000Z", host: null }),
    ]);
    const section = screen.getByRole("region", {
      name: en.homeRecent.title,
    });
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(2);

    const first = within(items[0]!).getByRole("link");
    expect(first).toHaveAttribute("href", "/events/event-1");
    expect(first.textContent).toContain("Gathering 1");
    expect(first.textContent).toContain("by AI Amsterdam");
    expect(within(items[0]!).getByText(/20 Sep/)).toHaveAttribute(
      "datetime",
      "2026-09-20",
    );

    // No host: the place stands in; another year shows the year.
    expect(items[1]!.textContent).toContain("Amsterdam, Netherlands");
    expect(items[1]!.textContent).toContain("2025");
  });

  it("shows at most three", () => {
    renderIn([event(1), event(2), event(3), event(4)]);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("is left out entirely when nothing has happened yet", () => {
    const { container } = renderIn([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("speaks Dutch on /nl", () => {
    renderIn([event(1, { host: "AI Amsterdam" })], "nl");
    const section = screen.getByRole("region", { name: nl.homeRecent.title });
    expect(section.textContent).toContain(nl.homeRecent.lead);
    expect(section.textContent).toContain("door AI Amsterdam");
  });
});
