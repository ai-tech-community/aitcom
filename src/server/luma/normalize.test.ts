import { describe, expect, it } from "vitest";

import type { LumaEvent } from "./client";
import { normalizeLumaEvent } from "./normalize";

function makeLumaEvent(overrides: Partial<LumaEvent> = {}): LumaEvent {
  return {
    api_id: "evt-123",
    name: "AI Builders Meetup",
    description_md: "A meetup for AI builders.",
    start_at: "2026-07-20T16:00:00.000Z",
    end_at: "2026-07-20T18:00:00.000Z",
    cover_url: "https://images.lu.ma/cover.png",
    url: "ai-builders",
    geo_address_json: null,
    meeting_url: null,
    max_capacity: 100,
    timezone: "Europe/Amsterdam",
    ...overrides,
  };
}

describe("normalizeLumaEvent format derivation", () => {
  it('derives "in-person" from a physical address only (geo present, no meeting url)', () => {
    const normalized = normalizeLumaEvent(
      makeLumaEvent({
        geo_address_json: { address: "Startup Village, Amsterdam" },
        meeting_url: null,
      }),
      "community-1",
    );

    expect(normalized.format).toBe("in-person");
  });

  it('derives "online" from a meeting url only (no geo address)', () => {
    const normalized = normalizeLumaEvent(
      makeLumaEvent({
        geo_address_json: null,
        meeting_url: "https://meet.google.com/abc-defg-hij",
      }),
      "community-1",
    );

    expect(normalized.format).toBe("online");
  });

  it('derives "hybrid" when both a physical address and a meeting url are present', () => {
    const normalized = normalizeLumaEvent(
      makeLumaEvent({
        geo_address_json: { address: "Startup Village, Amsterdam" },
        meeting_url: "https://meet.google.com/abc-defg-hij",
      }),
      "community-1",
    );

    expect(normalized.format).toBe("hybrid");
  });

  it('defaults to "online" when neither a geo address nor a meeting url is present (TBA)', () => {
    const normalized = normalizeLumaEvent(
      makeLumaEvent({ geo_address_json: null, meeting_url: null }),
      "community-1",
    );

    expect(normalized.format).toBe("online");
  });

  it('treats a geo_address_json object without an address string as "online" (no physical signal)', () => {
    const normalized = normalizeLumaEvent(
      makeLumaEvent({ geo_address_json: {}, meeting_url: null }),
      "community-1",
    );

    expect(normalized.format).toBe("online");
  });
});

describe("normalizeLumaEvent display format", () => {
  it("keeps the conflict default out of what people read (TBA)", () => {
    const normalized = normalizeLumaEvent(
      makeLumaEvent({ geo_address_json: null, meeting_url: null }),
      "community-1",
    );
    // The conflict check still counts it as online…
    expect(normalized.format).toBe("online");
    // …but a list must not say "Online" for a place nobody announced.
    expect(normalized.displayFormat).toBeNull();
    expect(normalized.location).toBe("TBA");
  });

  it("matches the stated format whenever the source states one", () => {
    const cases = [
      [
        { geo_address_json: { address: "Amsterdam" }, meeting_url: null },
        "in-person",
      ],
      [
        { geo_address_json: null, meeting_url: "https://meet.example/x" },
        "online",
      ],
      [
        {
          geo_address_json: { address: "Amsterdam" },
          meeting_url: "https://meet.example/x",
        },
        "hybrid",
      ],
    ] as const;
    for (const [overrides, expected] of cases) {
      const normalized = normalizeLumaEvent(makeLumaEvent(overrides), "c");
      expect(normalized.displayFormat).toBe(expected);
      expect(normalized.format).toBe(expected);
    }
  });
});
