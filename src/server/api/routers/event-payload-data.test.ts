import { describe, it, expect } from "vitest";
import type { Payload } from "payload";
import { buildEventPayloadData, eventUpsertSchema } from "./event-upsert-data";

// None of these cases pass `audience`, so resolveAudienceIds short-circuits
// before ever touching `payload.find` — an unimplemented stub is enough.
const noopPayload = {} as Payload;

describe("buildEventPayloadData", () => {
  const base = {
    title: "AI Builders Meetup",
    type: "meetup" as const,
    date: "2026-06-12",
    location: "Amsterdam",
  };

  it("passes coverImage media id straight through", async () => {
    const data = await buildEventPayloadData(noopPayload, {
      ...base,
      coverImage: 42,
    });
    expect(data.coverImage).toBe(42);
  });

  it("leaves coverImage undefined when not provided", async () => {
    const data = await buildEventPayloadData(noopPayload, base);
    expect(data.coverImage).toBeUndefined();
  });

  it("passes a valid IANA timezone through", async () => {
    const data = await buildEventPayloadData(noopPayload, {
      ...base,
      timezone: "America/New_York",
    });
    expect(data.timezone).toBe("America/New_York");
  });

  it("leaves timezone undefined when not provided, so the collection default (Europe/Amsterdam) applies", async () => {
    const data = await buildEventPayloadData(noopPayload, base);
    expect(data.timezone).toBeUndefined();
  });
});

describe("eventUpsertSchema timezone validation", () => {
  const base = {
    title: "AI Builders Meetup",
    type: "meetup" as const,
    date: "2026-06-12",
    location: "Amsterdam",
  };

  it("accepts a valid IANA timezone", () => {
    const parsed = eventUpsertSchema.safeParse({
      ...base,
      timezone: "Europe/Amsterdam",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a missing timezone", () => {
    expect(eventUpsertSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a non-IANA timezone", () => {
    const parsed = eventUpsertSchema.safeParse({
      ...base,
      timezone: "Not/A_Zone",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a bare abbreviation", () => {
    const parsed = eventUpsertSchema.safeParse({ ...base, timezone: "CEST" });
    expect(parsed.success).toBe(false);
  });
});

describe("eventUpsertSchema time shape validation", () => {
  const base = {
    title: "AI Builders Meetup",
    type: "meetup" as const,
    date: "2026-06-12",
    location: "Amsterdam",
  };

  it("accepts HH:MM times and missing times", () => {
    expect(
      eventUpsertSchema.safeParse({
        ...base,
        startTime: "18:00",
        endTime: "21:00",
      }).success,
    ).toBe(true);
    expect(eventUpsertSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a startTime that is not HH:MM", () => {
    const parsed = eventUpsertSchema.safeParse({ ...base, startTime: "6pm" });
    expect(parsed.success).toBe(false);
  });
});
