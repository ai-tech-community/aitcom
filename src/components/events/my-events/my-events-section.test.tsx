import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: nav.refresh }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
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

import type { MyEventItem } from "./my-events-list";
import { MyEventsSection, type MyEventsView } from "./my-events-section";

const ITEM: MyEventItem = {
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

function renderSection(
  props: Partial<React.ComponentProps<typeof MyEventsSection>> = {},
  locale: "en" | "nl" = "en",
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <MyEventsSection
        view={"upcoming" as MyEventsView}
        counts={{ upcoming: 1, past: 4 }}
        items={[ITEM]}
        failed={false}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("MyEventsSection", () => {
  beforeEach(() => {
    nav.replace.mockReset();
    nav.refresh.mockReset();
  });

  it("lists the member's events under an h2 section heading", () => {
    renderSection();
    expect(
      screen.getByRole("heading", { level: 2, name: /your events/i }),
    ).toBeTruthy();
    expect(screen.getByText("RAG deep-dive")).toBeTruthy();
  });

  it("filters with the shared segmented control and keeps the filter in the URL", () => {
    renderSection();
    const group = screen.getByRole("radiogroup", { name: "Which events" });
    expect(group).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Upcoming/ })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /Past/ }).closest("label"),
    ).toHaveTextContent("Past4");

    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: /Past/ }));
    });
    expect(nav.replace).toHaveBeenCalledWith("/dashboard/events?past=1", {
      scroll: false,
    });
  });

  it("teaches the next step when there is nothing to show", () => {
    renderSection({ items: [], counts: { upcoming: 0, past: 0 } });
    expect(screen.getByText("No upcoming events")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse events" })).toHaveAttribute(
      "href",
      "/events",
    );
  });

  it("has its own empty words for past events", () => {
    renderSection({ view: "past", items: [] });
    expect(screen.getByText("No past events yet")).toBeTruthy();
  });

  it("shows an error with retry, not 'no events', when the load failed", () => {
    renderSection({ items: [], counts: null, failed: true });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("No upcoming events")).toBeNull();
    // Counts are unknown, so the filter shows none.
    expect(
      screen.getByRole("radio", { name: /Upcoming/ }).closest("label"),
    ).toHaveTextContent(/^Upcoming$/);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it("renders in Dutch", () => {
    renderSection({ items: [] }, "nl");
    expect(
      screen.getByRole("heading", { level: 2, name: /jouw evenementen/i }),
    ).toBeTruthy();
    expect(screen.getByText("Geen aankomende evenementen")).toBeTruthy();
  });
});
