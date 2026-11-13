import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import type { GalleryFacets } from "@/server/gallery/items";
import { GalleryToolbar } from "./gallery-toolbar";
import type { GalleryFilters } from "./gallery-params";

// Radix Select scrolls to the chosen option and captures the pointer;
// jsdom has neither.
Object.assign(Element.prototype, {
  scrollIntoView: () => undefined,
  hasPointerCapture: () => false,
  releasePointerCapture: () => undefined,
});

const NONE: GalleryFilters = {
  event: null,
  topic: null,
  type: null,
  item: null,
};

const FACETS: GalleryFacets = {
  events: [
    { id: 4, title: "Autumn hack night", day: "2026-11-02" },
    { id: 3, title: "Summer picnic", day: "2026-07-14" },
  ],
  topics: ["meetups", "retired-topic"],
  hasUnlinked: true,
};

const TOPICS = [
  { id: 1, slug: "meetups", label: "Meetups", emoji: "🍕" },
  { id: 2, slug: "jobs", label: "Jobs", emoji: null },
];

function renderToolbar(
  props: Partial<React.ComponentProps<typeof GalleryToolbar>> = {},
) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <GalleryToolbar
        filters={NONE}
        facets={FACETS}
        topics={TOPICS}
        onChange={onChange}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onChange };
}

function openEventSelect() {
  const trigger = screen.getByRole("combobox", { name: "Event" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.getByRole("listbox");
}

describe("GalleryToolbar", () => {
  it("offers all events, each event with its day, and no event", () => {
    renderToolbar();
    expect(screen.getByRole("combobox", { name: "Event" })).toHaveTextContent(
      "All events",
    );
    const options = within(openEventSelect()).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "All events",
      "Autumn hack night · Nov 2, 2026",
      "Summer picnic · Jul 14, 2026",
      "Not from an event",
    ]);
  });

  it("leaves out 'Not from an event' when every item has an event", () => {
    renderToolbar({ facets: { ...FACETS, hasUnlinked: false } });
    expect(
      within(openEventSelect()).queryByRole("option", {
        name: "Not from an event",
      }),
    ).toBeNull();
  });

  it("reports the chosen event", () => {
    const { onChange } = renderToolbar();
    fireEvent.click(
      within(openEventSelect()).getByRole("option", {
        name: "Summer picnic · Jul 14, 2026",
      }),
    );
    expect(onChange).toHaveBeenCalledWith({ event: 3 });
  });

  it("reports 'Not from an event' and back to all", () => {
    const { onChange } = renderToolbar({ filters: { ...NONE, event: 4 } });
    fireEvent.click(
      within(openEventSelect()).getByRole("option", {
        name: "Not from an event",
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith({ event: "none" });
    fireEvent.click(
      within(openEventSelect()).getByRole("option", { name: "All events" }),
    );
    expect(onChange).toHaveBeenLastCalledWith({ event: null });
  });

  it("names an event from a link even before it is among the choices", () => {
    renderToolbar({ filters: { ...NONE, event: 99 } });
    expect(screen.getByRole("combobox", { name: "Event" })).toHaveTextContent(
      "This event",
    );
  });

  it("shows categories as one choice, with their labels", () => {
    renderToolbar({ filters: { ...NONE, topic: "meetups" } });
    const group = screen.getByRole("radiogroup", { name: "Category" });
    const radios = within(group).getAllByRole("radio");
    expect(
      radios.map(
        (r) => r.getAttribute("aria-label") ?? r.closest("label")?.textContent,
      ),
    ).toEqual(["All", "🍕 Meetups", "retired-topic"]);
    expect(
      within(group).getByRole("radio", { name: "🍕 Meetups" }),
    ).toBeChecked();
  });

  it("reports the chosen category and clearing it", () => {
    const { onChange } = renderToolbar({
      filters: { ...NONE, topic: "meetups" },
    });
    const group = screen.getByRole("radiogroup", { name: "Category" });
    fireEvent.click(
      within(group).getByRole("radio", { name: "retired-topic" }),
    );
    expect(onChange).toHaveBeenLastCalledWith({ topic: "retired-topic" });
    fireEvent.click(within(group).getByRole("radio", { name: "All" }));
    expect(onChange).toHaveBeenLastCalledWith({ topic: null });
  });

  it("reports the chosen type", () => {
    const { onChange } = renderToolbar();
    const group = screen.getByRole("radiogroup", { name: "Type" });
    fireEvent.click(within(group).getByRole("radio", { name: "Videos" }));
    expect(onChange).toHaveBeenLastCalledWith({ type: "video" });
    fireEvent.click(within(group).getByRole("radio", { name: "Photos" }));
    expect(onChange).toHaveBeenLastCalledWith({ type: "photo" });
  });

  it("keeps the type filter while the other choices are unknown", () => {
    renderToolbar({ facets: undefined });
    expect(screen.queryByRole("combobox", { name: "Event" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Category" })).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Type" })).toBeVisible();
  });

  it("hides choices there is nothing to pick from", () => {
    renderToolbar({ facets: { events: [], topics: [], hasUnlinked: true } });
    expect(screen.queryByRole("combobox", { name: "Event" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Category" })).toBeNull();
  });
});
