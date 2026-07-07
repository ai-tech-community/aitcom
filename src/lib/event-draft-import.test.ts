import { describe, expect, it } from "vitest";

import {
  buildEventDraftImportBatch,
  buildEventDraftImportPayload,
  parseDiscoveredEventBatch,
} from "@/lib/event-draft-import";

describe("buildEventDraftImportPayload", () => {
  it("maps normalized scout output into a draft payload with discovery metadata", () => {
    const result = buildEventDraftImportPayload({
      title: "AI Agents in Production",
      description: "A practical meetup on shipping agent systems.",
      summary: "Production lessons from real-world agent deployments.",
      type: "meetup",
      date: "2026-05-05T18:00:00.000Z",
      startTime: "18:00",
      endTime: "20:30",
      location: "Amsterdam",
      format: "hybrid",
      region: "North Holland",
      country: "Netherlands",
      city: "Amsterdam",
      focus: "technical",
      level: "mid",
      audience: ["engineers", "founders"],
      sourceUrl: "https://example.com/events/ai-agents",
      aitFitScore: 9,
      tags: ["agents", " production ", "agents"],
      curatedByAgent: true,
      discoverySource: "daily-scout",
      confidenceScore: 0.9,
      lastVerifiedAt: "2026-04-19T06:00:00.000Z",
      reviewStatus: "discovered",
      coverImageUrl: "https://example.com/cover.jpg",
      videoUrl: "https://example.com/teaser.mp4",
    });

    expect(result.draftData.status).toBe("draft");
    expect(result.draftData.reviewStatus).toBe("discovered");
    expect(result.draftData.curatedByAgent).toBe(true);
    expect(result.draftData.tags).toEqual([
      { tag: "agents" },
      { tag: "production" },
    ]);
    expect(result.draftData.audience).toEqual(["engineers", "founders"]);
    expect(result.media.coverImageUrl).toBe("https://example.com/cover.jpg");
    expect(result.media.videoUrl).toBe("https://example.com/teaser.mp4");
  });

  it("uses safe defaults for minimally structured scout events", () => {
    const result = buildEventDraftImportPayload({
      title: "Open AI Builders Night",
      date: "2026-05-12",
    });

    expect(result.draftData.type).toBe("meetup");
    expect(result.draftData.location).toBe("TBD");
    expect(result.draftData.curatedByAgent).toBe(true);
    expect(result.draftData.reviewStatus).toBe("discovered");
    expect(result.draftData.description).toBeDefined();
  });
});

describe("audience slugs", () => {
  it("accepts arbitrary audience slugs, not just the legacy enum values", () => {
    // "executives" is a real `audiences` slug (src/lib/audience-seed.ts) that
    // was never part of the old 6-value EVENT_AUDIENCE_OPTIONS enum — the
    // schema must no longer constrain `audience` to that closed set now that
    // it's a pass-through slug array resolved server-side.
    const result = buildEventDraftImportPayload({
      title: "Executive AI Roundtable",
      date: "2026-06-01",
      audience: ["executives", "some-future-audience-slug"],
    });

    expect(result.draftData.audience).toEqual([
      "executives",
      "some-future-audience-slug",
    ]);
  });

  it("omits audience entirely when none are provided", () => {
    const result = buildEventDraftImportPayload({
      title: "Untargeted Event",
      date: "2026-06-02",
    });

    expect(result.draftData.audience).toBeUndefined();
  });
});

describe("discovered event batch helpers", () => {
  it("parses and maps batches", () => {
    const batch = parseDiscoveredEventBatch([
      {
        title: "Event One",
        date: "2026-05-01",
      },
      {
        title: "Event Two",
        date: "2026-05-02",
        sourceUrl: "https://example.com/event-two",
      },
    ]);

    expect(batch).toHaveLength(2);
    expect(buildEventDraftImportBatch(batch)).toHaveLength(2);
  });
});
