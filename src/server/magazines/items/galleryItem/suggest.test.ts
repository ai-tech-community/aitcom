import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETED_AUTHOR_ID } from "@/lib/account-deletion";

import { PICKER_LIMIT } from "@/lib/magazines/picker";

import { ITEM_PICKERS, pickerCandidatesFor } from "../pickers";
import type { InputOf } from "../registry";
import type { PickerSourceCandidate, SuggestConfig } from "../types";
import { galleryItemSuggester } from "./suggest";
import {
  event,
  fakes,
  item,
  NOW,
  pickerContext,
  suggestContext,
  WINDOW,
  type Doc,
  type Fakes,
} from "./test-fixtures";

// The registry imports every kind; none of them reach the database here.
vi.mock("@/server/db", () => ({ db: {} }));

// Vitest resolves next-intl's client entry. Keep the real message formatter,
// without the request wrapper, in these tests.
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/i18n/messages");
  return {
    getTranslations: async ({ locale }: { locale: "en" | "nl" }) =>
      createTranslator({ locale, messages: await loadMessages(locale) }),
  };
});

beforeEach(() => {
  vi.stubEnv("COMMUNITY_PAYMENTS_ENABLED", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const at = (day: string) => `2026-11-${day}T12:00:00.000Z`;

/**
 * Five events that ended in the window. Model night has the most items the
 * editor may feature; Pizza talk and Hack night end on the same day, later
 * than Demo day; Old night's other items may not be featured.
 */
const EVENTS = [
  event(5, "Model night", "2026-11-05"),
  event(6, "Demo day", "2026-11-08"),
  event(7, "Pizza talk", "2026-11-10"),
  event(8, "Hack night", "2026-11-10"),
  event(9, "Old night", "2026-11-02"),
];
const ITEMS = [
  item(1, { event: 5, createdAt: at("06") }),
  item(2, { event: 5, createdAt: at("07"), caption: "The keynote" }),
  item(3, { event: 5, createdAt: at("07") }),
  item(4, { event: 6, createdAt: at("09") }),
  item(10, { event: 7, createdAt: at("11") }),
  item(11, { event: 8, createdAt: at("11") }),
  item(12, { event: 9, createdAt: at("03") }),
  item(13, { event: 9, createdAt: at("04"), magazineConsent: false }),
  item(14, { event: 9, createdAt: at("04"), hiddenAt: at("05") }),
  item(15, { event: 9, createdAt: at("04"), uploaderId: DELETED_AUTHOR_ID }),
  item(16, { event: 9, createdAt: at("04"), status: "uploading" }),
];

function suggest(
  f: Fakes,
  config: Partial<SuggestConfig> = {},
  viewerId = "u2",
  window = WINDOW,
) {
  return galleryItemSuggester.suggest(suggestContext(f, viewerId), window, {
    limit: 10,
    exclude: [],
    ...config,
  });
}

const highlights = (candidates: Awaited<ReturnType<typeof suggest>>) =>
  candidates.map((candidate) => ({
    id: candidate.input.galleryItemId,
    ...candidate.reason,
  }));

describe("gallery highlights for automatic drafts", () => {
  it("ranks ended events by how much the editor may feature, then later end, then id", async () => {
    const f = fakes({ items: ITEMS, events: EVENTS, role: "member" });
    expect(highlights(await suggest(f))).toEqual([
      { id: 2, type: "galleryHighlight", eventTitle: "Model night", count: 3 },
      { id: 10, type: "galleryHighlight", eventTitle: "Pizza talk", count: 1 },
      { id: 11, type: "galleryHighlight", eventTitle: "Hack night", count: 1 },
      { id: 4, type: "galleryHighlight", eventTitle: "Demo day", count: 1 },
      { id: 12, type: "galleryHighlight", eventTitle: "Old night", count: 1 },
    ]);
  });

  it("offers one item per event: the newest, then the lower id", async () => {
    const f = fakes({ items: ITEMS, events: EVENTS, role: "member" });
    const [first] = await suggest(f, { limit: 1 });
    expect(first).toEqual({
      input: { kind: "galleryItem", galleryItemId: 2 },
      title: "The keynote",
      facts: [
        { type: "event", title: "Model night" },
        { type: "date", label: "added", at: at("07") },
        { type: "mediaType", mediaType: "photo" },
      ],
      openHref: "/communities/town/gallery?item=2",
      reason: { type: "galleryHighlight", eventTitle: "Model night", count: 3 },
    });
  });

  it("keeps the limit, best first", async () => {
    const f = fakes({ items: ITEMS, events: EVENTS, role: "member" });
    expect(
      (await suggest(f, { limit: 2 })).map((c) => c.input.galleryItemId),
    ).toEqual([2, 10]);
    const none = fakes({ items: ITEMS, events: EVENTS, role: "member" });
    expect(await suggest(none, { limit: 0 })).toEqual([]);
    expect(none.payload.find).not.toHaveBeenCalled();
  });

  it("never offers an excluded item, and still counts it for its event", async () => {
    const f = fakes({ items: ITEMS, events: EVENTS, role: "member" });
    const result = await suggest(f, {
      exclude: ["galleryItem:2", "galleryItem:4", "event:10", "galleryItem:x"],
    });
    expect(highlights(result)).toEqual([
      { id: 3, type: "galleryHighlight", eventTitle: "Model night", count: 3 },
      { id: 10, type: "galleryHighlight", eventTitle: "Pizza talk", count: 1 },
      { id: 11, type: "galleryHighlight", eventTitle: "Hack night", count: 1 },
      { id: 12, type: "galleryHighlight", eventTitle: "Old night", count: 1 },
    ]);
  });

  it("gives the same answer whatever order the rows come in", async () => {
    const first = await suggest(
      fakes({ items: ITEMS, events: EVENTS, role: "member" }),
    );
    const reversed = await suggest(
      fakes({
        items: [...ITEMS].reverse(),
        events: [...EVENTS].reverse(),
        role: "member",
      }),
    );
    expect(reversed).toEqual(first);
  });

  it("leaves out items without consent, hidden ones, unfinished ones and those of deleted accounts", async () => {
    const f = fakes({
      items: ITEMS.filter((doc) => doc.event === 9 && doc.id !== 12),
      events: EVENTS,
      role: "moderator",
    });
    expect(await suggest(f, {}, "u3")).toEqual([]);
  });

  it("counts and offers only what the editor may read", async () => {
    const items: Doc[] = [
      item(1, { event: 5 }),
      item(2, { event: 5 }),
      item(3, { event: 5, visibility: "public" }),
      item(4, { event: 6, visibility: "public" }),
      item(5, { event: 6, visibility: "public" }),
    ];
    const member = fakes({ items, events: EVENTS, role: "member" });
    expect(highlights(await suggest(member))).toEqual([
      expect.objectContaining({ eventTitle: "Model night", count: 3 }),
      expect.objectContaining({ eventTitle: "Demo day", count: 2 }),
    ]);
    const outsider = fakes({ items, events: EVENTS, role: null });
    expect(highlights(await suggest(outsider, {}, "staff"))).toEqual([
      { id: 5, type: "galleryHighlight", eventTitle: "Demo day", count: 2 },
      { id: 3, type: "galleryHighlight", eventTitle: "Model night", count: 1 },
    ]);
  });

  it("looks only at events that ended in the window, up to now", async () => {
    const events = [
      event(5, "Model night", "2026-11-13"),
      event(6, "Today", "2026-11-14"),
      event(7, "Too long ago", "2026-10-10"),
      event(8, "Called off", "2026-11-05", { status: "cancelled" }),
      event(9, "Other town", "2026-11-05", { communityId: "c2" }),
      event(10, "Two days", "2026-11-01", {
        endDate: "2026-11-02T00:00:00.000Z",
      }),
    ];
    const items = [5, 6, 7, 8, 9, 10].map((id) => item(id, { event: id }));
    const f = fakes({
      items: [...items, item(20, { event: null })],
      events,
      role: "member",
    });
    const result = await suggest(f, {}, "u2", {
      since: WINDOW.since,
      until: new Date(NOW.getTime() + 7 * 86_400_000),
    });
    expect(result.map((c) => c.reason)).toEqual([
      { type: "galleryHighlight", eventTitle: "Model night", count: 1 },
      { type: "galleryHighlight", eventTitle: "Two days", count: 1 },
    ]);
  });

  it("asks for no gallery items when no event ended", async () => {
    const f = fakes({
      items: ITEMS,
      events: [event(5, "Later", "2026-11-20")],
      role: "member",
    });
    expect(await suggest(f)).toEqual([]);
    expect(f.payload.find.mock.calls.map(([args]) => args.collection)).toEqual([
      "events",
    ]);
  });

  it("Review Focus 4: carries no file link, so a draft stores none", async () => {
    const f = fakes({ items: ITEMS, events: EVENTS, role: "member" });
    const result = await suggest(f);
    expect(result.length).toBeGreaterThan(0);
    for (const candidate of result) {
      expect(candidate).not.toHaveProperty("thumbnailUrl");
      expect(Object.keys(candidate.reason).sort()).toEqual([
        "count",
        "eventTitle",
        "type",
      ]);
      expect(JSON.stringify(candidate)).not.toMatch(/https?:|signed|thumb/);
    }
    expect(f.storageSource).not.toHaveBeenCalled();
  });

  it("counts on a light query and reads full rows only for the chosen items", async () => {
    const f = fakes({ items: ITEMS, events: EVENTS, role: "member" });
    await suggest(f, { limit: 2 });
    const reads = f.payload.find.mock.calls
      .map(([args]) => args)
      .filter((args) => args.collection === "gallery-items");
    expect(reads).toHaveLength(2);
    expect(reads[0]!.select).toEqual({ event: true, createdAt: true });
    expect(reads[1]!.select).toBeUndefined();
    expect(JSON.stringify(reads[1]!.where)).toContain('"in":[2,10]');
  });

  it("drops an event that is gone before the limit applies", async () => {
    const f = fakes({ items: ITEMS, events: EVENTS, role: "member" });
    const find = f.payload.find.getMockImplementation()!;
    // Model night disappears between the ended-events read and the titles.
    f.payload.find.mockImplementation(async (args) => {
      const found = await find(args);
      return args.collection === "events" && args.select?.title
        ? { docs: found.docs.filter((doc) => doc.id !== 5) }
        : found;
    });
    expect(highlights(await suggest(f, { limit: 1 }))).toEqual([
      { id: 10, type: "galleryHighlight", eventTitle: "Pizza talk", count: 1 },
    ]);
  });
});

describe("gallery highlights in the picker", () => {
  const manyEvents = Array.from({ length: PICKER_LIMIT + 1 }, (_, i) =>
    event(100 + i, `Night ${i}`, "2026-11-10"),
  );
  const oneEach = manyEvents.map((ev, i) =>
    item(i + 1, { event: ev.id, createdAt: at("01") }),
  );
  // Newer items of no ended event fill the plain newest-first search.
  const newer = Array.from({ length: PICKER_LIMIT }, (_, i) =>
    item(200 + i, { event: null, createdAt: at("13") }),
  );

  it("links a thumbnail for every suggested highlight shown", async () => {
    const f = fakes({
      items: [...oneEach, ...newer],
      events: manyEvents,
      role: "member",
    });
    const search = vi.spyOn(ITEM_PICKERS.galleryItem, "search");
    const shown = await pickerCandidatesFor(
      "galleryItem",
      "",
      pickerContext(f, "u2"),
      [],
      async () => ({ ctx: suggestContext(f, "u2"), window: WINDOW }),
    );
    expect(shown).toHaveLength(PICKER_LIMIT);
    for (const candidate of shown) {
      expect(candidate.reason).toMatchObject({ type: "galleryHighlight" });
      expect(candidate.thumbnailUrl).toBe(
        `https://signed.test/private/gallery/c1/u${candidate.input.galleryItemId}-thumb.jpg`,
      );
    }
    // Twelve highlights fill the picker: no search ran to lend thumbnails.
    expect(search).not.toHaveBeenCalled();
    expect(f.storage.signedGetUrl).toHaveBeenCalledTimes(PICKER_LIMIT);
    search.mockRestore();
  });

  it("links no thumbnail for an item the editor may not feature", async () => {
    const f = fakes({
      items: [
        item(1),
        item(2, { visibility: "public" }),
        item(3, { visibility: "public", hiddenAt: at("12") }),
        item(4, { visibility: "public", magazineConsent: false }),
      ],
      role: null,
    });
    const candidate = (
      galleryItemId: number,
    ): PickerSourceCandidate<InputOf<"galleryItem">> => ({
      input: { kind: "galleryItem" as const, galleryItemId },
      title: `Item ${galleryItemId}`,
      facts: [],
      openHref: null,
    });
    const decorated = await ITEM_PICKERS.galleryItem.decorate!(
      [1, 2, 3, 4].map(candidate),
      pickerContext(f, "staff"),
    );
    expect(decorated.map((c) => c.thumbnailUrl ?? null)).toEqual([
      null,
      "https://public.test/media/gallery/public/c1/u2-thumb.jpg",
      null,
      null,
    ]);
    expect(f.storage.signedGetUrl).not.toHaveBeenCalled();
  });
});
