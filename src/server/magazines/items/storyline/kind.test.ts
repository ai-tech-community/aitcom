import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IssueReaderAccess } from "@/lib/magazines/access";
import {
  loadStorylineCards,
  listStorylines,
  type StorylineCard,
} from "@/server/news/storylines";

import type { Deps, PayloadClient } from "../../deps";
import { itemContextFor } from "../context";
import { PICKER_LIMIT } from "@/lib/magazines/picker";
import { searchPickerCandidates } from "../pickers";
import { loadIssueItemViews } from "../registry";
import { storylineItemKind } from "./kind";

vi.mock("@/server/news/storylines", () => ({
  loadStorylineCards: vi.fn(),
  listStorylines: vi.fn(),
}));

const loadCards = vi.mocked(loadStorylineCards);

function context(
  access: IssueReaderAccess = "editor",
  locale: "en" | "nl" = "en",
) {
  return itemContextFor(
    { db: {} as Deps["db"], payload: {} as PayloadClient },
    {
      magazineId: 1,
      community: { id: "community", slug: "community" },
      issueId: 2,
      locale,
      access,
      viewerId: null,
    },
  );
}

function card(
  id: string,
  overrides: Partial<StorylineCard> = {},
): StorylineCard {
  return {
    id,
    slug: `story-${id}`,
    titleEn: "AI on devices",
    titleNl: "AI op je apparaat",
    overviewEn: "Local models keep your files on your own device.",
    overviewNl:
      "Met lokale modellen blijven je bestanden op je eigen apparaat.",
    articleCount: 14,
    latestAt: new Date("2026-10-24T10:00:00.000Z"),
    isPublic: true,
    ...overrides,
  };
}

const stored = (id: string, storylineId = id) => ({
  id: `block-${id}`,
  storylineId,
  intro: "Our take",
});

beforeEach(() => {
  loadCards.mockReset();
  loadCards.mockResolvedValue(new Map());
});

describe("storyline item kind", () => {
  it("loads every story of an issue in one query", async () => {
    const ctx = context();
    await storylineItemKind.load(
      [stored("s1"), stored("s2"), stored("s3")],
      ctx,
    );
    expect(loadCards).toHaveBeenCalledExactlyOnceWith(
      ["s1", "s2", "s3"],
      ctx.db,
    );
  });

  it("shows a public story live, marks unpublished and deleted ones", async () => {
    const opening = "One two three four five six seven eight nine ten. "
      .repeat(4)
      .trim();
    loadCards.mockResolvedValue(
      new Map([
        [
          "s1",
          card("s1", { overviewEn: `${opening} These extra words stay out.` }),
        ],
        ["s2", card("s2", { isPublic: false })],
      ]),
    );
    const blocks = [stored("s1"), stored("s2"), stored("s3")];
    const editor = await storylineItemKind.load(blocks, context());
    expect([...editor.values()]).toEqual([
      {
        kind: "storyline",
        itemId: "block-s1",
        intro: "Our take",
        storyline: {
          slug: "story-s1",
          title: "AI on devices",
          overview: `${opening}…`,
          sourceCount: 14,
          updatedAt: "2026-10-24T10:00:00.000Z",
        },
      },
      {
        kind: "storyline",
        itemId: "block-s2",
        unavailable: true,
        reason: "unpublished",
      },
      {
        kind: "storyline",
        itemId: "block-s3",
        unavailable: true,
        reason: "missing",
      },
    ]);
    const reader = await loadIssueItemViews(
      blocks.map((block) => ({ ...block, blockType: "storyline" })),
      context("full"),
    );
    expect(reader).toEqual([editor.get("block-s1")]);
  });

  it("falls back to English text when the Dutch text is empty", async () => {
    loadCards.mockResolvedValue(
      new Map([["s1", card("s1", { titleNl: "", overviewNl: "  " })]]),
    );
    expect(
      (await storylineItemKind.load([stored("s1")], context("full", "nl"))).get(
        "block-s1",
      ),
    ).toMatchObject({
      storyline: {
        title: "AI on devices",
        overview: "Local models keep your files on your own device.",
      },
    });
    loadCards.mockResolvedValue(new Map([["s1", card("s1")]]));
    expect(
      (
        await storylineItemKind.load([stored("s1")], context("editor", "nl"))
      ).get("block-s1"),
    ).toMatchObject({
      storyline: {
        title: "AI op je apparaat",
        overview:
          "Met lokale modellen blijven je bestanden op je eigen apparaat.",
      },
    });
  });

  it("refuses a new story that is not public, accepts it when kept", async () => {
    loadCards.mockResolvedValue(
      new Map([
        ["s1", card("s1", { isPublic: false })],
        ["s2", card("s2")],
      ]),
    );
    const items = [
      { index: 2, stored: stored("s1"), isNew: true },
      { index: 3, stored: stored("s2"), isNew: true },
      { index: 4, stored: stored("unknown"), isNew: true },
    ];
    expect(await storylineItemKind.validate(items, context())).toEqual([
      { itemIndex: 2, code: "ITEM_INVALID" },
      { itemIndex: 4, code: "ITEM_INVALID" },
    ]);
    expect(loadCards).toHaveBeenCalledTimes(1);
    expect(
      await storylineItemKind.validate(
        items.map((item) => ({ ...item, isNew: false })),
        context(),
      ),
    ).toEqual([]);
  });

  it("refuses a duplicate story", async () => {
    loadCards.mockResolvedValue(new Map([["s1", card("s1")]]));
    for (const isNew of [true, false]) {
      expect(
        await storylineItemKind.validate(
          [
            { index: 0, stored: stored("s1"), isNew },
            { index: 3, stored: stored("copy", "s1"), isNew },
          ],
          context(),
        ),
      ).toEqual([{ itemIndex: 3, code: "ITEM_INVALID", detail: "duplicate" }]);
    }
  });

  it("round-trips input and keeps the intro", () => {
    const block = storylineItemKind.toStored({
      kind: "storyline",
      storylineId: "s1",
      intro: " Our take ",
    });
    expect(block).toEqual({ intro: "Our take", storylineId: "s1" });
    expect(storylineItemKind.toInput({ ...block, id: "saved" })).toEqual({
      kind: "storyline",
      id: "saved",
      storylineId: "s1",
      intro: "Our take",
    });
    expect(storylineItemKind.referenceOf(block)).toBe("storyline:s1");
    expect(
      storylineItemKind.toStored({
        kind: "storyline",
        storylineId: "s1",
        intro: "  ",
      }).intro,
    ).toBeNull();
    expect(
      storylineItemKind.input.safeParse({ kind: "storyline", storylineId: "" })
        .success,
    ).toBe(false);
    expect(
      storylineItemKind.input.safeParse({
        kind: "storyline",
        storylineId: "s".repeat(256),
      }).success,
    ).toBe(false);
  });
});

describe("storyline picker", () => {
  it("searches the public story list with localized titles and structured facts", async () => {
    const summary = {
      ...card("s1", { titleNl: "  " }),
      latestAt: "2026-10-24T10:00:00.000Z",
      status: "published" as const,
      questionsEn: [],
      questionsNl: [],
      publishedAt: null,
      announcedAt: null,
      revision: 1,
      createdBy: null,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      score: 0,
      myVote: null,
      credit: { human: null, agentName: null },
    };
    vi.mocked(listStorylines).mockResolvedValue({
      items: [summary],
      total: 1,
      page: 1,
      totalPages: 1,
    });
    const ctx = {
      deps: { db: {} as Deps["db"], payload: {} as PayloadClient },
      magazineId: 1,
      community: { id: "c", slug: "c" },
      viewerId: "editor",
      locale: "nl" as const,
    };
    expect(await searchPickerCandidates("storyline", "local", ctx)).toEqual([
      {
        input: { kind: "storyline", storylineId: "s1" },
        reference: "storyline:s1",
        title: "AI on devices",
        facts: [
          { type: "count", what: "sources", value: 14 },
          { type: "date", label: "updated", at: "2026-10-24T10:00:00.000Z" },
        ],
        openHref: null,
      },
    ]);
    expect(listStorylines).toHaveBeenCalledWith({
      q: "local",
      limit: PICKER_LIMIT,
    });
    vi.mocked(listStorylines).mockResolvedValue({
      items: [{ ...summary, titleNl: "AI op je apparaat", latestAt: null }],
      total: 1,
      page: 1,
      totalPages: 1,
    });
    expect(
      (await searchPickerCandidates("storyline", "", ctx))[0],
    ).toMatchObject({
      title: "AI op je apparaat",
      facts: [{ type: "count", what: "sources", value: 14 }],
    });
  });
});
