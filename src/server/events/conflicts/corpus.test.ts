import { describe, expect, it, vi } from "vitest";
import type { Payload } from "payload";

import { DEFAULT_EVENT_TIMEZONE } from "@/lib/event-time";
import type { ConflictVerdict } from "./rule";
import {
  corpusDateWindow,
  expandAudiences,
  fetchCorpus,
  toWireConflict,
} from "./corpus";

function mockPayload(responses: Array<{ docs: unknown[] }>): {
  payload: Payload;
  find: ReturnType<typeof vi.fn>;
} {
  const find = vi.fn();
  for (const response of responses) find.mockResolvedValueOnce(response);
  return { payload: { find } as unknown as Payload, find };
}

describe("expandAudiences", () => {
  it("resolves direct slugs to full audience shape via a single where:{slug:{in}} query, then the whole-collection query", async () => {
    const { payload, find } = mockPayload([
      {
        docs: [
          {
            id: 1,
            slug: "engineers",
            name: "Engineers",
            preferredSlots: [
              { weekdays: ["tue"], startTime: "18:00", endTime: "20:00" },
            ],
            relatedAudiences: [],
          },
        ],
      },
      { docs: [{ id: 1, slug: "engineers", relatedAudiences: [] }] },
    ]);

    const result = await expandAudiences(payload, ["engineers"]);

    expect(result.direct).toEqual([
      {
        id: 1,
        slug: "engineers",
        name: "Engineers",
        preferredSlots: [
          { weekdays: ["tue"], startTime: "18:00", endTime: "20:00" },
        ],
      },
    ]);
    expect(find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        collection: "audiences",
        where: { slug: { in: ["engineers"] } },
        depth: 0,
      }),
    );
    expect(find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ collection: "audiences", depth: 0 }),
    );
  });

  it("falls back to an empty preferredSlots array when the doc's preferredSlots is null", async () => {
    const { payload } = mockPayload([
      {
        docs: [
          { id: 1, slug: "marketers", name: "Marketers", preferredSlots: null },
        ],
      },
      { docs: [{ id: 1, slug: "marketers", relatedAudiences: null }] },
    ]);

    const result = await expandAudiences(payload, ["marketers"]);

    expect(result.direct[0]?.preferredSlots).toEqual([]);
  });

  it("drops unknown slugs, keeping only matched direct audiences", async () => {
    const { payload } = mockPayload([
      {
        docs: [
          {
            id: 1,
            slug: "engineers",
            name: "Engineers",
            preferredSlots: [],
          },
        ],
      },
      { docs: [{ id: 1, slug: "engineers", relatedAudiences: [] }] },
    ]);

    const result = await expandAudiences(payload, [
      "engineers",
      "not-a-real-slug",
    ]);

    expect(result.direct.map((a) => a.slug)).toEqual(["engineers"]);
  });

  it("returns an empty result without querying when no slugs are given", async () => {
    const { payload, find } = mockPayload([]);

    const result = await expandAudiences(payload, []);

    expect(result).toEqual({ direct: [], relatedIdSet: new Set() });
    expect(find).not.toHaveBeenCalled();
  });

  it("returns an empty result after a single query when none of the given slugs match (empty-audience early return)", async () => {
    const { payload, find } = mockPayload([{ docs: [] }]);

    const result = await expandAudiences(payload, ["not-a-real-slug"]);

    expect(result).toEqual({ direct: [], relatedIdSet: new Set() });
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("expands forward: a direct audience listing a non-direct id in relatedAudiences", async () => {
    // founders (direct, id 2) lists executives (id 7) as related; executives
    // does not list founders back.
    const { payload } = mockPayload([
      {
        docs: [
          { id: 2, slug: "founders", name: "Founders", preferredSlots: [] },
        ],
      },
      {
        docs: [
          { id: 2, slug: "founders", relatedAudiences: [7] },
          { id: 7, slug: "executives", relatedAudiences: [] },
        ],
      },
    ]);

    const result = await expandAudiences(payload, ["founders"]);

    expect(result.relatedIdSet).toEqual(new Set([7]));
  });

  it("expands in reverse: a non-direct audience listing a direct id in relatedAudiences (symmetric by contract)", async () => {
    // executives (direct, id 7) is listed nowhere itself, but founders (id 2,
    // non-direct) lists executives — the link is bidirectional by contract.
    const { payload } = mockPayload([
      {
        docs: [
          { id: 7, slug: "executives", name: "Executives", preferredSlots: [] },
        ],
      },
      {
        docs: [
          { id: 7, slug: "executives", relatedAudiences: [] },
          { id: 2, slug: "founders", relatedAudiences: [7] },
        ],
      },
    ]);

    const result = await expandAudiences(payload, ["executives"]);

    expect(result.relatedIdSet).toEqual(new Set([2]));
  });

  it("handles populated relatedAudiences docs (depth > 0) defensively", async () => {
    const { payload } = mockPayload([
      {
        docs: [
          { id: 2, slug: "founders", name: "Founders", preferredSlots: [] },
        ],
      },
      {
        docs: [
          {
            id: 2,
            slug: "founders",
            relatedAudiences: [{ id: 7, slug: "executives" }],
          },
          { id: 7, slug: "executives", relatedAudiences: [] },
        ],
      },
    ]);

    const result = await expandAudiences(payload, ["founders"]);

    expect(result.relatedIdSet).toEqual(new Set([7]));
  });
});

describe("fetchCorpus", () => {
  function baseDoc(overrides: Record<string, unknown> = {}) {
    return {
      id: 100,
      title: "Corpus Event",
      date: "2026-07-15",
      startTime: "18:00",
      endTime: "20:00",
      timezone: "Europe/Amsterdam",
      format: "in-person",
      city: "Amsterdam",
      latitude: 52.3676,
      longitude: 4.9041,
      audience: [1],
      status: "published",
      sourceUrl: null,
      communityId: "community-1",
      ...overrides,
    };
  }

  it("issues a single payload.find with the exact documented where clause (no excludeEventId)", async () => {
    const { payload, find } = mockPayload([{ docs: [] }]);

    await fetchCorpus(payload, {
      dateFrom: "2026-07-07",
      dateTo: "2026-07-23",
      audienceIdsExpanded: [1, 2],
    });

    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith({
      collection: "events",
      draft: false,
      depth: 0,
      limit: 300,
      where: {
        and: [
          { date: { greater_than_equal: "2026-07-07" } },
          { date: { less_than_equal: "2026-07-23" } },
          { status: { in: ["published", "draft"] } },
          {
            or: [
              { reviewStatus: { equals: "approved" } },
              { reviewStatus: { exists: false } },
            ],
          },
          { audience: { in: [1, 2] } },
        ],
      },
    });
  });

  it("appends an id:{not_equals} clause when excludeEventId is given (own event excluded when editing)", async () => {
    const { payload, find } = mockPayload([{ docs: [] }]);

    await fetchCorpus(payload, {
      dateFrom: "2026-07-07",
      dateTo: "2026-07-23",
      audienceIdsExpanded: [1],
      excludeEventId: 42,
    });

    const call = find.mock.calls[0]![0] as {
      where: { and: unknown[] };
    };
    expect(call.where.and).toContainEqual({ id: { not_equals: 42 } });
    expect(call.where.and).toHaveLength(6);
  });

  it("maps a doc to a CorpusEvent, including audience ids and communityId", async () => {
    const { payload } = mockPayload([{ docs: [baseDoc()] }]);

    const corpus = await fetchCorpus(payload, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      audienceIdsExpanded: [1],
    });

    expect(corpus).toEqual([
      {
        id: 100,
        title: "Corpus Event",
        date: "2026-07-15",
        startTime: "18:00",
        endTime: "20:00",
        timezone: "Europe/Amsterdam",
        format: "in-person",
        city: "Amsterdam",
        latitude: 52.3676,
        longitude: 4.9041,
        audienceIds: [1],
        tentative: false,
        sourceUrl: null,
        communityId: "community-1",
      },
    ]);
  });

  it("falls back timezone to DEFAULT_EVENT_TIMEZONE when the doc's timezone is null", async () => {
    const { payload } = mockPayload([{ docs: [baseDoc({ timezone: null })] }]);

    const [event] = await fetchCorpus(payload, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      audienceIdsExpanded: [1],
    });

    expect(event?.timezone).toBe(DEFAULT_EVENT_TIMEZONE);
  });

  it('falls back format to "online" when the doc\'s format is null', async () => {
    const { payload } = mockPayload([{ docs: [baseDoc({ format: null })] }]);

    const [event] = await fetchCorpus(payload, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      audienceIdsExpanded: [1],
    });

    expect(event?.format).toBe("online");
  });

  it('marks tentative:true when status is "draft"', async () => {
    const { payload } = mockPayload([{ docs: [baseDoc({ status: "draft" })] }]);

    const [event] = await fetchCorpus(payload, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      audienceIdsExpanded: [1],
    });

    expect(event?.tentative).toBe(true);
  });

  it('marks tentative:false when status is "published"', async () => {
    const { payload } = mockPayload([
      { docs: [baseDoc({ status: "published" })] },
    ]);

    const [event] = await fetchCorpus(payload, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      audienceIdsExpanded: [1],
    });

    expect(event?.tentative).toBe(false);
  });

  it("maps a populated (depth > 0) audience relationship entry to its id defensively", async () => {
    const { payload } = mockPayload([
      {
        docs: [baseDoc({ audience: [{ id: 5, slug: "researchers" }, 6] })],
      },
    ]);

    const [event] = await fetchCorpus(payload, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      audienceIdsExpanded: [5, 6],
    });

    expect(event?.audienceIds).toEqual([5, 6]);
  });

  it("maps a non-array audience relationship (null) to an empty audienceIds list", async () => {
    const { payload } = mockPayload([{ docs: [baseDoc({ audience: null })] }]);

    const [event] = await fetchCorpus(payload, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      audienceIdsExpanded: [1],
    });

    expect(event?.audienceIds).toEqual([]);
  });
});

describe("corpusDateWindow", () => {
  it("returns candidate date +/- 8 days (7-day suggestion window + 1-day buffer)", () => {
    expect(corpusDateWindow("2026-07-15")).toEqual({
      dateFrom: "2026-07-07",
      dateTo: "2026-07-23",
    });
  });

  it("strips a full ISO timestamp down to its calendar date before shifting", () => {
    expect(corpusDateWindow("2026-07-15T18:00:00.000Z")).toEqual({
      dateFrom: "2026-07-07",
      dateTo: "2026-07-23",
    });
  });
});

describe("toWireConflict", () => {
  function makeVerdict(
    overrides: Partial<ConflictVerdict> = {},
  ): ConflictVerdict {
    return {
      grade: "clash",
      audienceMatch: "direct",
      tentative: false,
      overlapMinutes: 30,
      event: {
        id: 100,
        title: "Secret Org's Event",
        date: "2026-07-15",
        startTime: "18:00",
        endTime: "20:00",
        timezone: "Europe/Amsterdam",
        format: "in-person",
        city: "Amsterdam",
        latitude: null,
        longitude: null,
        audienceIds: [1],
        tentative: false,
        sourceUrl: null,
        communityId: "community-1",
      },
      ...overrides,
    };
  }

  it("anonymizes a tentative-hold verdict to exactly {tentative, grade, audienceMatch, date, sourceType} — no leaking keys", () => {
    const verdict = makeVerdict({
      tentative: true,
      event: { ...makeVerdict().event, tentative: true },
    });

    const wire = toWireConflict(verdict);
    const serialized = JSON.parse(JSON.stringify(wire)) as Record<
      string,
      unknown
    >;

    expect(Object.keys(serialized).sort()).toEqual(
      ["audienceMatch", "date", "grade", "sourceType", "tentative"].sort(),
    );
    expect(serialized).toEqual({
      tentative: true,
      grade: "clash",
      audienceMatch: "direct",
      date: "2026-07-15",
      sourceType: "hold",
    });
    // Explicitly assert the sensitive keys are absent, not just unlisted.
    expect(serialized.id).toBeUndefined();
    expect(serialized.title).toBeUndefined();
    expect(serialized.startTime).toBeUndefined();
    expect(serialized.endTime).toBeUndefined();
    expect(serialized.timezone).toBeUndefined();
    expect(serialized.communityId).toBeUndefined();
    expect(serialized.sourceUrl).toBeUndefined();
  });

  it("truncates a full ISO event date down to its calendar date for a tentative verdict", () => {
    const verdict = makeVerdict({
      tentative: true,
      event: {
        ...makeVerdict().event,
        tentative: true,
        date: "2026-07-15T18:00:00.000Z",
      },
    });

    expect(toWireConflict(verdict).date).toBe("2026-07-15");
  });

  it("passes full identifying fields through for a non-tentative native event", () => {
    const wire = toWireConflict(makeVerdict());

    expect(wire).toEqual({
      tentative: false,
      grade: "clash",
      audienceMatch: "direct",
      overlapMinutes: 30,
      id: 100,
      title: "Secret Org's Event",
      date: "2026-07-15",
      startTime: "18:00",
      endTime: "20:00",
      timezone: "Europe/Amsterdam",
      sourceType: "native",
      sourceUrl: null,
    });
  });

  it('tags sourceType "import" when the non-tentative event carries a sourceUrl', () => {
    const wire = toWireConflict(
      makeVerdict({
        event: {
          ...makeVerdict().event,
          sourceUrl: "https://luma.com/some-event",
        },
      }),
    );

    expect(wire).toMatchObject({
      sourceType: "import",
      sourceUrl: "https://luma.com/some-event",
    });
  });
});
