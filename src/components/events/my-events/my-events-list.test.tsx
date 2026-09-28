import { afterEach, describe, expect, it, vi } from "vitest";
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

import { MyEventsList, type MyEventItem } from "./my-events-list";

const NOW = new Date("2026-09-27T10:00:00.000Z");

const DEEP_DIVE: MyEventItem = {
  key: "r1",
  status: "registered",
  external: false,
  event: {
    id: 2,
    slug: "rag-deep-dive",
    title: "RAG deep-dive",
    type: "deep_dive",
    format: "in-person",
    date: "2026-10-05T00:00:00.000Z",
    startTime: "10:00",
    timezone: "Europe/Amsterdam",
    city: "Utrecht",
    country: "Netherlands",
    location: "Utrecht",
    host: "AIT Community Netherlands",
  },
};

function renderIn(items: MyEventItem[], locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <MyEventsList items={items} now={NOW} />
    </NextIntlClientProvider>,
  );
}

describe("MyEventsList", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("dates each event by its own day, padded, for a viewer west of UTC", () => {
    process.env.TZ = "America/Los_Angeles";
    // The old dashboard formatter printed "2026.10.4" here.
    expect(new Date(DEEP_DIVE.event.date).getDate()).toBe(4);
    const { container } = renderIn([DEEP_DIVE]);
    const time = container.querySelector("time");
    expect(time).toHaveAttribute("dateTime", "2026-10-05");
    expect(time).toHaveTextContent(/^05 Oct/);
    expect(time).toHaveTextContent("10:00 CEST");
  });

  it("links the row to the event and names type and status", () => {
    renderIn([DEEP_DIVE]);
    const link = screen.getByRole("link", { name: /RAG deep-dive/ });
    expect(link).toHaveAttribute("href", "/events/rag-deep-dive");
    expect(within(link).getByText("Deep Dive")).toBeInTheDocument();
    expect(within(link).getByText("Registered")).toBeInTheDocument();
  });

  it("speaks Dutch on the Dutch dashboard", () => {
    renderIn(
      [{ ...DEEP_DIVE, status: "pending_payment", external: true }],
      "nl",
    );
    const link = screen.getByRole("link", { name: /RAG deep-dive/ });
    expect(within(link).getByText("Wacht op betaling")).toBeInTheDocument();
    expect(within(link).getByText("Extern")).toBeInTheDocument();
    expect(link).toHaveTextContent("okt");
  });

  it("shows an unknown status as stored rather than guess", () => {
    renderIn([{ ...DEEP_DIVE, status: "checked_in" }]);
    expect(screen.getByText("checked in")).toBeInTheDocument();
  });
});
