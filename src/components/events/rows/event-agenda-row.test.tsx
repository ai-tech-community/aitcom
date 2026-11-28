import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import { EventAgendaRow } from "./event-agenda-row";
import type { EventRow } from "./event-rows";

vi.mock("@/i18n/navigation", () => ({ Link: "a" }));

const event: EventRow = {
  key: "1",
  link: { kind: "external", href: "https://example.org/example" },
  title: "Repair notes review",
  dateTime: "2026-12-20",
  day: "20",
  month: "Dec",
  weekday: "Sun",
  year: null,
  time: "19:00 CET",
  timeRange: "19:00–20:30 CET",
  formatLabel: "Online",
  placeParts: ["Online"],
  host: null,
  kind: { type: "workshop", label: "Workshop" },
};

it("shows the event-local date, time and place with an independent organizer action", () => {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <EventAgendaRow row={event} actions={<button>Attendees</button>} />
    </NextIntlClientProvider>,
  );
  const link = screen.getByRole("link", { name: /Repair notes review/ });
  expect(link).toHaveAttribute("target", "_blank");
  expect(within(link).getByText("20 Dec 2026", { exact: true })).toBeVisible();
  expect(
    within(link).getByText("19:00–20:30 CET", { exact: true }),
  ).toBeVisible();
  expect(within(link).getAllByText("Online")).toHaveLength(1);
  expect(within(link).getByText("20").closest("time")).toHaveAttribute(
    "datetime",
    "2026-12-20",
  );
  expect(link).not.toContainElement(
    screen.getByRole("button", { name: "Attendees" }),
  );
});
