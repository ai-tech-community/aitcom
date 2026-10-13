import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BUILDER_PUBLIC_EVENTS } from "./builder-public-events";
import {
  EVENT_COORDINATE_BACKFILL,
  UPCOMING_VENUE_EVENT_SLUGS,
} from "./event-coordinates";
import { eventHasMappableVenue, toMapEvents } from "./map-events";

const dir = dirname(fileURLToPath(import.meta.url));
const COORDINATE_MIGRATION = join(
  dir,
  "../../migrations/20261013b_event_coordinate_backfill.ts",
);
const MIGRATION_INDEX = join(dir, "../../migrations/index.ts");

describe("toMapEvents", () => {
  it("pins every upcoming event that has a venue location", () => {
    const bySlug = new Map(
      EVENT_COORDINATE_BACKFILL.map((row) => [row.slug, row]),
    );
    const upcoming = UPCOMING_VENUE_EVENT_SLUGS.map((slug, index) => {
      const point = bySlug.get(slug);
      expect(point, slug).toBeDefined();
      return {
        id: index + 1,
        slug,
        title: slug,
        date: "2026-10-16T12:00:00.000Z",
        location: "Venue",
        latitude: point!.latitude,
        longitude: point!.longitude,
        type: "conference",
      };
    });

    const pins = toMapEvents(upcoming);
    expect(pins.map((pin) => pin.slug)).toEqual([
      ...UPCOMING_VENUE_EVENT_SLUGS,
    ]);
    expect(pins).toHaveLength(UPCOMING_VENUE_EVENT_SLUGS.length);
    expect(pins.length).toBeGreaterThan(2);
  });

  it("keeps a numeric-string coordinate from Postgres", () => {
    const [pin] = toMapEvents([
      {
        id: 79,
        slug: "techex-amsterdam-hackathon-2026",
        title: "TechEx Amsterdam Hackathon",
        date: "2026-10-16T12:00:00.000Z",
        location: "RAI Amsterdam",
        latitude: "52.3412264",
        longitude: "4.8899065",
        type: "conference",
      },
    ]);
    expect(pin).toMatchObject({
      slug: "techex-amsterdam-hackathon-2026",
      latitude: 52.3412264,
      longitude: 4.8899065,
    });
  });

  it("omits an event that still has no coordinates", () => {
    expect(
      toMapEvents([
        {
          id: 1,
          slug: "no-point",
          title: "No point",
          date: "2026-10-16T12:00:00.000Z",
          location: "RAI Amsterdam",
          latitude: null,
          longitude: null,
          type: "meetup",
        },
      ]),
    ).toEqual([]);
  });
});

describe("event coordinate backfill", () => {
  it("covers every staff event and every upcoming venue event", () => {
    const slugs = EVENT_COORDINATE_BACKFILL.map((row) => row.slug);
    for (const event of BUILDER_PUBLIC_EVENTS) {
      expect(eventHasMappableVenue(event), event.slug).toBe(true);
      expect(slugs, event.slug).toContain(event.slug);
    }
    for (const slug of UPCOMING_VENUE_EVENT_SLUGS) {
      expect(slugs, slug).toContain(slug);
    }
    for (const row of EVENT_COORDINATE_BACKFILL) {
      expect(Number.isFinite(row.latitude)).toBe(true);
      expect(Number.isFinite(row.longitude)).toBe(true);
    }
  });

  it("writes each point from the deploy migration and does not replace one already stored", () => {
    const migration = readFileSync(COORDINATE_MIGRATION, "utf8");
    const index = readFileSync(MIGRATION_INDEX, "utf8");
    expect(index.indexOf("20261013a_event_type_conference")).toBeGreaterThan(
      index.indexOf("20261013a_news_rumors"),
    );
    expect(
      index.indexOf("20261013b_event_coordinate_backfill"),
    ).toBeGreaterThan(index.indexOf("20261013a_event_type_conference"));
    expect(migration).toContain("EVENT_COORDINATE_BACKFILL");
    expect(migration).toContain(
      'AND ("latitude" IS NULL OR "longitude" IS NULL)',
    );
  });
});
