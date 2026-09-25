import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PUBLIC_EVENTS_WHY_MAX } from "./public-events";
import {
  BUILDER_PUBLIC_EVENTS,
  builderEventDescription,
} from "./builder-public-events";

const dir = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  dir,
  "../../migrations/20260925a_builder_public_events.ts",
);
const MIGRATION_INDEX = join(dir, "../../migrations/index.ts");
const EVENTS_PAGE = join(dir, "../../app/[locale]/events/page.tsx");

const COUNT_COPY =
  /\b(\d+|no)\s+(attendees?|RSVPs?|spots?(?:\s+left)?|registrations?)\b/i;

describe("builder public events", () => {
  it("lands the five ops-cleared events in start-date order", () => {
    expect(BUILDER_PUBLIC_EVENTS.map((event) => event.slug)).toEqual([
      "the-ai-conference-2026",
      "world-summit-ai-amsterdam-2026",
      "ai-engineer-new-york-2026",
      "nvidia-gtc-berlin-2026",
      "tedai-2026",
    ]);
    const dates = BUILDER_PUBLIC_EVENTS.map((event) => event.date);
    expect([...dates].sort()).toEqual(dates);
    const first = dates[0];
    const second = dates[1];
    if (first === undefined || second === undefined) {
      throw new Error("builder events are missing start dates");
    }
    expect(first < second).toBe(true);
  });

  it("uses only the cleared facts and omits attendance, price, and images", () => {
    expect(BUILDER_PUBLIC_EVENTS).toEqual([
      expect.objectContaining({
        title: "The AI Conference 2026",
        date: "2026-09-29",
        city: "San Francisco",
        location: "Pier 48, San Francisco",
        url: "https://aiconference.com/",
      }),
      expect.objectContaining({
        title: "World Summit AI Amsterdam 2026",
        date: "2026-10-07",
        city: "Amsterdam",
        location: "Taets Art & Event Park, Amsterdam",
        url: "https://worldsummit.ai/",
      }),
      expect.objectContaining({
        title: "AI Engineer New York 2026",
        date: "2026-10-12",
        city: "New York",
        url: "https://ai.engineer/nyc/2026",
      }),
      expect.objectContaining({
        title: "NVIDIA GTC Berlin 2026",
        date: "2026-10-20",
        city: "Berlin",
        location: "Tempodrom + STATION-Berlin",
        url: "https://www.nvidia.com/en-eu/gtc/",
      }),
      expect.objectContaining({
        title: "TEDAI 2026",
        date: "2026-10-28",
        city: "Vienna",
        url: "https://tedai-vienna.ted.com/",
      }),
    ]);

    for (const event of BUILDER_PUBLIC_EVENTS) {
      expect(event.url.startsWith("https://")).toBe(true);
      expect(event.summary.en.length).toBeGreaterThan(0);
      expect(event.summary.en.length).toBeLessThanOrEqual(
        PUBLIC_EVENTS_WHY_MAX,
      );
      expect(event.summary.nl.length).toBeGreaterThan(0);
      expect(event.summary.nl.length).toBeLessThanOrEqual(
        PUBLIC_EVENTS_WHY_MAX,
      );
      expect(event.summary.en).not.toMatch(COUNT_COPY);
      expect(event.summary.nl).not.toMatch(COUNT_COPY);
      expect(JSON.stringify(event).toLowerCase()).not.toContain("turku");
      expect(event).not.toHaveProperty("maxAttendees");
      expect(event).not.toHaveProperty("price");
      expect(event).not.toHaveProperty("image");
      expect(event).not.toHaveProperty("rsvp");
    }
  });

  it("keeps the official URL in the description without inventing a count", () => {
    const event = BUILDER_PUBLIC_EVENTS[0];
    expect(event).toBeDefined();
    const doc = builderEventDescription(
      event!.summary.en,
      event!.url,
      "Official page:",
    );
    const text = doc.root.children[0]?.children[0]?.text ?? "";
    expect(text).toContain(event!.url);
    expect(text).toContain("Pier 48");
    expect(text).not.toMatch(COUNT_COPY);
  });

  it("registers a Payload seed migration that retires Turku and skips counts", () => {
    const migration = readFileSync(MIGRATION, "utf8");
    const index = readFileSync(MIGRATION_INDEX, "utf8");
    expect(index).toContain("20260925a_builder_public_events");
    expect(migration).toContain("BUILDER_PUBLIC_EVENTS");
    expect(migration).toMatch(/turku/i);
    expect(migration).toContain("cancelled");
    expect(migration).toContain("archived");
    expect(migration).not.toMatch(/max_attendees|image_id|cover_image|"price"/);
    const page = readFileSync(EVENTS_PAGE, "utf8");
    expect(page).toContain('collection: "events"');
    expect(page).toMatch(/isPast\s*\?\s*"-date"\s*:\s*"date"/);
  });
});
