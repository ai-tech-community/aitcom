import { describe, expect, it, vi } from "vitest";
import type { MigrateUpArgs } from "@payloadcms/db-postgres";

import {
  BUILDER_PUBLIC_EVENTS,
  type BuilderPublicEvent,
} from "@/lib/events/builder-public-events";
import {
  upsertBuilderEvent,
  writeBuilderEventEndDate,
} from "./20260925a_builder_public_events";

function queryText(query: unknown): string {
  const seen = new Set<unknown>();
  const parts: string[] = [];
  const walk = (value: unknown) => {
    if (value == null || seen.has(value)) return;
    if (typeof value === "string" || typeof value === "number") {
      parts.push(String(value));
      return;
    }
    if (typeof value !== "object") return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    for (const nested of Object.values(value as Record<string, unknown>)) {
      walk(nested);
    }
  };
  walk(query);
  return parts.join(" ");
}

function mockDb(columnExists: boolean) {
  const queries: string[] = [];
  const execute = vi.fn(async (query: unknown) => {
    const text = queryText(query);
    queries.push(text);
    if (text.includes("information_schema")) {
      return { rows: columnExists ? [{ ok: 1 }] : [] };
    }
    return { rows: [] };
  });
  return {
    db: { execute } as unknown as MigrateUpArgs["db"],
    queries,
  };
}

function eventBySlug(slug: string): BuilderPublicEvent {
  const event = BUILDER_PUBLIC_EVENTS.find((row) => row.slug === slug);
  if (!event) throw new Error(`${slug} missing from BUILDER_PUBLIC_EVENTS`);
  return event;
}

describe("writeBuilderEventEndDate", () => {
  it("does nothing when the seed has no end date", async () => {
    const { db, queries } = mockDb(true);
    await writeBuilderEventEndDate(db, eventBySlug("aixia-2026"));
    expect(queries).toEqual([]);
  });

  it("skips the write when the column is not there yet", async () => {
    const { db, queries } = mockDb(false);
    await writeBuilderEventEndDate(
      db,
      eventBySlug("pytorch-conference-north-america-2026"),
    );
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("information_schema");
    expect(queries.some((query) => query.includes("UPDATE"))).toBe(false);
  });

  it("sets the events row and its versions when the column exists", async () => {
    const { db, queries } = mockDb(true);
    await writeBuilderEventEndDate(db, eventBySlug("web-summit-2026"));
    const updates = queries.filter((query) => query.includes("UPDATE"));
    expect(updates).toHaveLength(2);
    expect(updates[0]).toContain("end_date");
    expect(updates[0]).toContain("2026-11-12T12:00:00.000Z");
    expect(updates[0]).toContain("web-summit-2026");
    expect(updates[1]).toContain("version_end_date");
    expect(updates[1]).toContain("2026-11-12T12:00:00.000Z");
    expect(updates[1]).toContain("web-summit-2026");
  });
});

describe("upsertBuilderEvent", () => {
  it("keeps the original insert when endDate is absent", async () => {
    const { db, queries } = mockDb(true);
    await upsertBuilderEvent(db, eventBySlug("aixia-2026"));
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("INSERT INTO");
    expect(queries[0]).not.toContain("end_date");
  });

  it("does not reference end_date until the column exists", async () => {
    const { db, queries } = mockDb(false);
    await upsertBuilderEvent(db, eventBySlug("world-summit-ai-amsterdam-2026"));
    expect(queries[0]).toContain("INSERT INTO");
    expect(queries[0]).not.toContain("end_date");
    expect(queries.slice(1).some((query) => query.includes("UPDATE"))).toBe(
      false,
    );
  });

  it("writes the documented end date after the upsert once the column exists", async () => {
    const { db, queries } = mockDb(true);
    await upsertBuilderEvent(db, eventBySlug("world-summit-ai-amsterdam-2026"));
    const updates = queries.filter(
      (query) =>
        query.includes('SET "end_date"') ||
        query.includes('SET "version_end_date"'),
    );
    expect(updates).toHaveLength(2);
    expect(updates[0]).toContain("2026-10-08T12:00:00.000Z");
    expect(updates[0]).toContain("world-summit-ai-amsterdam-2026");
    expect(updates[1]).toContain("version_end_date");
  });
});
