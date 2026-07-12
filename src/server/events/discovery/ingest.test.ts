import { describe, expect, it, vi } from "vitest";
import type { Payload } from "payload";

import { lexicalToPlainText } from "@/server/challenge-engine/lexical";
import type { NormalizedEvent } from "@/server/luma/normalize";
import type { ClassificationResult } from "./classify";
import {
  archiveStaleDiscoveredEvents,
  buildDiscoveredEventData,
  upsertDiscoveredEvent,
} from "./ingest";

function makeNormalized(
  overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
  return {
    id: "luma-abc123",
    title: "AI Builders Meetup",
    slug: null,
    description: "A meetup for AI builders.",
    type: "meetup",
    date: "2026-07-20",
    startTime: "18:00",
    endTime: "20:00",
    timezone: "Europe/Amsterdam",
    location: "Startup Village, Amsterdam",
    maxAttendees: 100,
    image: "https://images.lu.ma/cover.png",
    status: "published",
    communityId: "community-1",
    source: "luma",
    lumaUrl: "https://lu.ma/ai-builders",
    coverImageId: null,
    coverImageUrl: null,
    ...overrides,
  };
}

function makeClassification(
  overrides: Partial<ClassificationResult> = {},
): ClassificationResult {
  return { audienceIds: [1, 2], confidence: 0.67, ...overrides };
}

const NOW_ISO = "2026-07-12T09:00:00.000Z";

describe("buildDiscoveredEventData", () => {
  it("maps the full documented field set from a normalized event + classification", () => {
    const n = makeNormalized();
    const classification = makeClassification();

    const data = buildDiscoveredEventData(n, classification, NOW_ISO);

    expect(data).toMatchObject({
      title: "AI Builders Meetup",
      date: "2026-07-20",
      startTime: "18:00",
      endTime: "20:00",
      timezone: "Europe/Amsterdam",
      location: "Startup Village, Amsterdam",
      type: "meetup",
      status: "published",
      communityId: "community-1",
      discoverySource: "luma",
      curatedByAgent: true,
      sourceUrl: "https://lu.ma/ai-builders",
      reviewStatus: "approved",
      lastVerifiedAt: NOW_ISO,
      confidenceScore: 0.67,
      audience: [1, 2],
    });
    // description is converted to Lexical rich-text JSON (the events
    // collection's `description` field type) — assert via the round-trip
    // helper rather than the raw node tree.
    expect(lexicalToPlainText(data.description)).toBe(
      "A meetup for AI builders.",
    );
  });

  it("prefers the normalized event's real format signal over the location heuristic (online event whose location would heuristically read in-person)", () => {
    // Regression: an online Luma event ("Online"/venue-name location) that
    // the string heuristic alone would misclassify as "in-person" — and thus
    // gate it out of the conflict catchment — must keep its real "online"
    // format from the source.
    const data = buildDiscoveredEventData(
      makeNormalized({ format: "online", location: "Startup Village" }),
      makeClassification(),
      NOW_ISO,
    );

    expect(data.format).toBe("online");
  });

  it('carries a "hybrid" format signal through unchanged', () => {
    const data = buildDiscoveredEventData(
      makeNormalized({ format: "hybrid", location: "" }),
      makeClassification(),
      NOW_ISO,
    );

    expect(data.format).toBe("hybrid");
  });

  it('falls back to "in-person" from the location string when no format signal is present and location is non-empty and not a URL', () => {
    const data = buildDiscoveredEventData(
      makeNormalized({
        format: undefined,
        location: "Startup Village, Amsterdam",
      }),
      makeClassification(),
      NOW_ISO,
    );

    expect(data.format).toBe("in-person");
  });

  it('falls back to "online" from the location string when no format signal is present and location looks like a URL', () => {
    const data = buildDiscoveredEventData(
      makeNormalized({
        format: undefined,
        location: "https://meet.google.com/abc-defg-hij",
      }),
      makeClassification(),
      NOW_ISO,
    );

    expect(data.format).toBe("online");
  });

  it('falls back to "online" from the location string when no format signal is present and location is empty', () => {
    const data = buildDiscoveredEventData(
      makeNormalized({ format: undefined, location: "" }),
      makeClassification(),
      NOW_ISO,
    );

    expect(data.format).toBe("online");
  });

  it("passes a null endTime through unchanged", () => {
    const data = buildDiscoveredEventData(
      makeNormalized({ endTime: null }),
      makeClassification(),
      NOW_ISO,
    );

    expect(data.endTime).toBeNull();
  });

  it("sets coverImage to coverImageId when present", () => {
    const data = buildDiscoveredEventData(
      makeNormalized({ coverImageId: 42 }),
      makeClassification(),
      NOW_ISO,
    );

    expect(data.coverImage).toBe(42);
  });

  it("sets coverImage to undefined when coverImageId is null", () => {
    const data = buildDiscoveredEventData(
      makeNormalized({ coverImageId: null }),
      makeClassification(),
      NOW_ISO,
    );

    expect(data.coverImage).toBeUndefined();
  });

  it("carries an empty audience array through when classification matched nothing", () => {
    const data = buildDiscoveredEventData(
      makeNormalized(),
      makeClassification({ audienceIds: [], confidence: 0 }),
      NOW_ISO,
    );

    expect(data.audience).toEqual([]);
    expect(data.confidenceScore).toBe(0);
  });
});

describe("upsertDiscoveredEvent", () => {
  function mockPayload(findResult: { docs: unknown[] }) {
    const find = vi.fn().mockResolvedValue(findResult);
    const create = vi.fn().mockResolvedValue({ id: 999 });
    const update = vi.fn().mockResolvedValue({ id: 100 });
    return { find, create, update } as unknown as Payload & {
      find: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  }

  it("skips (no find/create/update) when lumaUrl is null — no dedupe key", async () => {
    const payload = mockPayload({ docs: [] });
    const n = makeNormalized({ lumaUrl: null });

    const result = await upsertDiscoveredEvent(
      payload,
      n,
      makeClassification(),
      NOW_ISO,
    );

    expect(result).toEqual({ action: "skipped" });
    expect(payload.find).not.toHaveBeenCalled();
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("creates a new event when the dedupe find returns no hit, using the documented where clause", async () => {
    const payload = mockPayload({ docs: [] });
    const n = makeNormalized();

    const result = await upsertDiscoveredEvent(
      payload,
      n,
      makeClassification(),
      NOW_ISO,
    );

    expect(payload.find).toHaveBeenCalledWith({
      collection: "events",
      where: {
        and: [
          { communityId: { equals: "community-1" } },
          { sourceUrl: { equals: "https://lu.ma/ai-builders" } },
          { discoverySource: { equals: "luma" } },
        ],
      },
      limit: 1,
      depth: 0,
    });
    expect(payload.create).toHaveBeenCalledTimes(1);
    expect(payload.update).not.toHaveBeenCalled();
    const createCall = (payload.create as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { collection: string; data: Record<string, unknown> };
    expect(createCall.collection).toBe("events");
    expect(createCall.data).toMatchObject({
      title: "AI Builders Meetup",
      communityId: "community-1",
      sourceUrl: "https://lu.ma/ai-builders",
      reviewStatus: "approved",
    });
    expect(typeof createCall.data.slug).toBe("string");
    expect((createCall.data.slug as string).length).toBeGreaterThan(0);
    expect(result).toEqual({ action: "created", eventId: 999 });
  });

  it("updates the existing event when the dedupe find returns a hit (re-approves if archived)", async () => {
    const payload = mockPayload({ docs: [{ id: 55 }] });
    const n = makeNormalized();

    const result = await upsertDiscoveredEvent(
      payload,
      n,
      makeClassification(),
      NOW_ISO,
    );

    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.update).toHaveBeenCalledTimes(1);
    const updateCall = (payload.update as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as {
      collection: string;
      id: number;
      data: Record<string, unknown>;
    };
    expect(updateCall.collection).toBe("events");
    expect(updateCall.id).toBe(55);
    expect(updateCall.data).toMatchObject({
      reviewStatus: "approved",
      sourceUrl: "https://lu.ma/ai-builders",
    });
    expect(updateCall.data.slug).toBeUndefined();
    expect(result).toEqual({ action: "updated", eventId: 55 });
  });
});

describe("archiveStaleDiscoveredEvents", () => {
  it("finds luma-discovered events for the community with sourceUrl not in the seen set, using the documented where clause", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] });
    const update = vi.fn();
    const payload = { find, update } as unknown as Payload;

    await archiveStaleDiscoveredEvents(
      payload,
      "community-1",
      new Set(["https://lu.ma/still-here"]),
    );

    expect(find).toHaveBeenCalledWith({
      collection: "events",
      where: {
        and: [
          { communityId: { equals: "community-1" } },
          { discoverySource: { equals: "luma" } },
          { sourceUrl: { not_in: ["https://lu.ma/still-here"] } },
        ],
      },
      limit: 500,
      depth: 0,
    });
  });

  it("archives (reviewStatus: archived) every event returned by the find, and returns the count", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 10 }, { id: 11 }] });
    const update = vi.fn().mockResolvedValue({ id: 10 });
    const payload = { find, update } as unknown as Payload;

    const count = await archiveStaleDiscoveredEvents(
      payload,
      "community-1",
      new Set(),
    );

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, {
      collection: "events",
      id: 10,
      data: { reviewStatus: "archived" },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      collection: "events",
      id: 11,
      data: { reviewStatus: "archived" },
    });
    expect(count).toBe(2);
  });

  it("returns 0 and issues no updates when nothing is stale", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] });
    const update = vi.fn();
    const payload = { find, update } as unknown as Payload;

    const count = await archiveStaleDiscoveredEvents(
      payload,
      "community-1",
      new Set(["https://lu.ma/still-here"]),
    );

    expect(update).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });
});
