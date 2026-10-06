import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { upsertBuilderEvent } from "../../migrations/20260925a_builder_public_events";
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
const TEDAI_MIGRATION = join(dir, "../../migrations/20260925b_tedai_vienna.ts");
const OCTOBER_MIGRATION = join(
  dir,
  "../../migrations/20261005a_pytorch_aixia_web_summit.ts",
);
const MIGRATION_INDEX = join(dir, "../../migrations/index.ts");
const EVENTS_PAGE = join(dir, "../../app/[locale]/events/page.tsx");

const COUNT_COPY =
  /\b(\d+|no)\s+(attendees?|RSVPs?|spots?(?:\s+left)?|registrations?)\b/i;

/** Static SQL text from a Drizzle `sql` query, without bound parameters. */
function staticSql(query: unknown): string {
  const chunks =
    (query as { queryChunks?: unknown[] } | undefined)?.queryChunks ?? [];
  return chunks
    .map((chunk) => {
      if (!chunk || typeof chunk !== "object" || !("value" in chunk)) {
        return "";
      }
      const value = (chunk as { value: unknown }).value;
      if (
        Array.isArray(value) &&
        value.every((part) => typeof part === "string")
      ) {
        return value.join("");
      }
      return "";
    })
    .join("");
}

describe("builder public events", () => {
  it("lands the ops-cleared events in start-date order", () => {
    expect(BUILDER_PUBLIC_EVENTS.map((event) => event.slug)).toEqual([
      "the-ai-conference-2026",
      "world-summit-ai-amsterdam-2026",
      "ai-engineer-new-york-2026",
      "nvidia-gtc-berlin-2026",
      "pytorch-conference-north-america-2026",
      "aixia-2026",
      "tedai-2026",
      "web-summit-2026",
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
        title: "PyTorch Conference North America 2026",
        date: "2026-10-20",
        city: "San Jose",
        location: "San Jose Convention Center, San Jose",
        url: "https://events.linuxfoundation.org/pytorch-conference-north-america/",
      }),
      expect.objectContaining({
        title: "AIxIA 2026",
        date: "2026-10-22",
        city: "Strasbourg",
        location: "Palais de la Musique et des Congrès, Strasbourg",
        url: "https://aixia.eu/en/home",
      }),
      expect.objectContaining({
        title: "TEDAI 2026",
        date: "2026-10-28",
        city: "Vienna",
        url: "https://tedai-vienna.ted.com/",
      }),
      expect.objectContaining({
        title: "Web Summit 2026",
        date: "2026-11-09",
        city: "Lisbon",
        location: "MEO Arena, Lisbon",
        url: "https://websummit.com/web-summit-2026/",
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

  it("upserts locales without a hard-coded enum__locales cast", async () => {
    const event = BUILDER_PUBLIC_EVENTS[0];
    expect(event).toBeDefined();
    let query: unknown;
    await upsertBuilderEvent(
      {
        execute: async (statement: unknown) => {
          query = statement;
        },
      } as never,
      event!,
    );

    const sqlText = staticSql(query);
    expect(sqlText).not.toContain("enum__locales");
    expect(sqlText).not.toMatch(/::\s*"public"\s*\.\s*"enum__locales"/);
    expect(sqlText).toContain('INSERT INTO "events_locales"');
    expect(sqlText).toContain('INSERT INTO "_events_v_locales"');
    expect(sqlText.match(/'en'/g)).toEqual(["'en'", "'en'"]);
    expect(sqlText.match(/'nl'/g)).toEqual(["'nl'", "'nl'"]);
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

  it("registers a follow-up migration that upserts tedai-2026 only", () => {
    const tedai = BUILDER_PUBLIC_EVENTS.find(
      (event) => event.slug === "tedai-2026",
    );
    expect(tedai).toMatchObject({
      title: "TEDAI 2026",
      date: "2026-10-28",
      city: "Vienna",
      country: "Austria",
      location: "Vienna",
      timezone: "Europe/Vienna",
      url: "https://tedai-vienna.ted.com/",
    });

    const migration = readFileSync(TEDAI_MIGRATION, "utf8");
    const index = readFileSync(MIGRATION_INDEX, "utf8");
    const prior = index.indexOf("20260925a_builder_public_events");
    const followUp = index.indexOf("20260925b_tedai_vienna");
    expect(prior).toBeGreaterThan(-1);
    expect(followUp).toBeGreaterThan(prior);
    expect(migration).toContain('const TEDAI_SLUG = "tedai-2026"');
    expect(migration).toContain("upsertBuilderEvent");
    expect(migration).toContain("BUILDER_PUBLIC_EVENTS");
    expect(migration).not.toMatch(
      /clinical|turku|max_attendees|image_id|"price"/i,
    );
  });

  it("registers a follow-up migration that upserts only the three new events", () => {
    const slugs = [
      "pytorch-conference-north-america-2026",
      "aixia-2026",
      "web-summit-2026",
    ] as const;
    for (const slug of slugs) {
      expect(BUILDER_PUBLIC_EVENTS.some((event) => event.slug === slug)).toBe(
        true,
      );
    }

    const migration = readFileSync(OCTOBER_MIGRATION, "utf8");
    const index = readFileSync(MIGRATION_INDEX, "utf8");
    const prior = index.indexOf("20261004a_collector_run_preset");
    const followUp = index.indexOf("20261005a_pytorch_aixia_web_summit");
    expect(prior).toBeGreaterThan(-1);
    expect(followUp).toBeGreaterThan(prior);
    expect(migration).toContain("upsertBuilderEvent");
    expect(migration).toContain("BUILDER_PUBLIC_EVENTS");
    for (const slug of slugs) {
      expect(migration).toContain(slug);
    }
    expect(migration).not.toMatch(
      /agentic economy|big data expo|apply ai summit|max_attendees|image_id|"price"|rsvp/i,
    );
    expect(JSON.stringify(BUILDER_PUBLIC_EVENTS)).not.toMatch(
      /agentic economy|big data expo|apply ai summit|maxAttendees|rsvp/i,
    );
  });
});
