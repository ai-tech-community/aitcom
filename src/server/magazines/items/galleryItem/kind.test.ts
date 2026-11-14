import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETED_AUTHOR_ID } from "@/lib/account-deletion";
import { PICKER_LIMIT } from "@/lib/magazines/picker";
import type { GalleryViewer } from "@/server/gallery/access";
import { matchesWhere } from "@/test/fake-payload-query";

import { searchPickerCandidates } from "../pickers";
import {
  issueItemInputSchema,
  loadIssueItemViews,
  toStoredItems,
  validateIssueItems,
} from "../registry";
import type { ItemContext } from "../types";
import {
  featurableByWhere,
  featurableWhere,
  isFeaturable,
  isFeaturableBy,
} from "./featurable";
import { galleryItemItemKind } from "./kind";
import { galleryItemSuggester } from "./suggest";
import {
  context,
  event,
  fakes,
  item,
  pickerContext,
  suggestContext,
  WINDOW,
  type Doc,
  type Fakes,
  type Where,
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

const stored = (galleryItemId: number, over: Doc = {}) => ({
  id: `block-${galleryItemId}`,
  galleryItemId,
  intro: null,
  ...over,
});
const block = (galleryItemId: number, over: Doc = {}) => ({
  blockType: "galleryItem" as const,
  ...stored(galleryItemId, over),
});

async function loaded(f: Fakes, ctx: ItemContext, ids: number[]) {
  return galleryItemItemKind.load(
    ids.map((id) => stored(id)),
    ctx,
  );
}

function reasons(views: Map<string, unknown>) {
  return Object.fromEntries(
    [...views].map(([key, view]) => [
      key,
      (view as { reason?: string }).reason ?? "shown",
    ]),
  );
}

describe("gallery item kind: load", () => {
  it("reads every item of an issue in one query and builds one gallery viewer", async () => {
    const f = fakes({ items: [item(1), item(2)], role: "member" });
    await loaded(f, context(f, "full", "u2"), [1, 2, 3]);
    const itemReads = f.payload.find.mock.calls.filter(
      ([args]) => args.collection === "gallery-items",
    );
    expect(itemReads).toHaveLength(1);
    expect(itemReads[0]![0]).toMatchObject({
      collection: "gallery-items",
      where: { id: { in: [1, 2, 3] } },
      depth: 0,
      pagination: false,
    });
    expect(f.communityRead).toHaveBeenCalledTimes(1);
    expect(f.db.select).toHaveBeenCalledTimes(1);
  });

  it("shows a readable item with live links, credit and its gallery link", async () => {
    const f = fakes({
      items: [item(1, { caption: "The keynote", alt: "A full room" })],
      role: "member",
    });
    const views = await loaded(f, context(f, "full", "u2"), [1]);
    expect(views.get("block-1")).toEqual({
      kind: "galleryItem",
      itemId: "block-1",
      intro: null,
      membersOnly: false,
      galleryItemId: 1,
      mediaType: "photo",
      url: "https://signed.test/private/gallery/c1/u1.jpg",
      thumbnailUrl: "https://signed.test/private/gallery/c1/u1-thumb.jpg",
      width: 2048,
      height: 1536,
      durationSeconds: null,
      caption: "The keynote",
      alt: "A full room",
      label: { text: "The keynote" },
      event: { title: "Model night", slug: "model-night" },
      uploader: { name: "Dana" },
      href: "/communities/town/gallery?item=1",
    });
  });

  describe("Review Focus 1: a members-only item never reaches a reader who can't see it", () => {
    const items = () => [item(1), item(2, { visibility: "public" })];

    it.each([
      ["a signed-out visitor", null, null],
      ["a signed-in non-member", "u9", null],
    ])(
      "gives %s of a public issue in a listed community no_access for a members-only item",
      async (_label, viewerId, role) => {
        const f = fakes({ items: items(), role, listed: true });
        const ctx = context(f, "full", viewerId);
        expect(reasons(await loaded(f, ctx, [1, 2]))).toEqual({
          "block-1": "no_access",
          "block-2": "shown",
        });
        // Its file is never linked, signed or otherwise.
        expect(f.storage.signedGetUrl).not.toHaveBeenCalled();
        const shown = await loadIssueItemViews([block(1), block(2)], ctx);
        expect(shown.map((view) => view.itemId)).toEqual(["block-2"]);
      },
    );

    it("gives outsiders of a members-only community nothing, public items included", async () => {
      const f = fakes({ items: items(), role: null, listed: false });
      expect(
        reasons(await loaded(f, context(f, "teaser", null), [1, 2])),
      ).toEqual({ "block-1": "no_access", "block-2": "no_access" });
      expect(f.storageSource).not.toHaveBeenCalled();
    });

    it("shows members-only items to members, with no marker for readers", async () => {
      const f = fakes({ items: items(), role: "member" });
      const views = await loaded(f, context(f, "full", "u2"), [1]);
      expect(views.get("block-1")).toMatchObject({ membersOnly: false });
    });

    it("marks members-only items for editors, not public ones", async () => {
      const f = fakes({ items: items(), role: "moderator" });
      const views = await loaded(f, context(f, "editor", "u3"), [1, 2]);
      expect(views.get("block-1")).toMatchObject({ membersOnly: true });
      expect(views.get("block-2")).toMatchObject({ membersOnly: false });
      // The editor's viewer and a signed-out visitor's: one read each.
      expect(f.communityRead).toHaveBeenCalledTimes(2);
    });

    it("marks a public item members-only where visitors can't read the community", async () => {
      const f = fakes({ items: items(), role: "moderator", listed: false });
      const views = await loaded(f, context(f, "editor", "u3"), [1, 2]);
      expect(views.get("block-1")).toMatchObject({ membersOnly: true });
      expect(views.get("block-2")).toMatchObject({ membersOnly: true });
      // Members reading the issue get no marker and no visitor read.
      const reader = fakes({ items: items(), role: "member", listed: false });
      const read = await loaded(reader, context(reader, "full", "u2"), [1, 2]);
      expect(read.get("block-2")).toMatchObject({ membersOnly: false });
      expect(reader.communityRead).toHaveBeenCalledTimes(1);
    });

    it("tells a non-member editor the item is no_access too", async () => {
      const f = fakes({ items: items(), role: null });
      expect(
        reasons(await loaded(f, context(f, "editor", "staff"), [1])),
      ).toEqual({ "block-1": "no_access" });
    });
  });

  describe("Review Focus 2: a withdrawn or hidden item never shows", () => {
    const items = () => [
      item(1, { magazineConsent: false }),
      item(2, { hiddenAt: "2026-11-13T12:00:00.000Z" }),
      item(3, { magazineConsent: null, visibility: "public" }),
    ];

    it.each([
      ["a moderator editor", "editor", "u3", "moderator"],
      ["a member editor", "editor", "u2", "member"],
      ["the uploader, as editor", "editor", "u1", "member"],
    ] as const)(
      "is withdrawn for %s",
      async (_label, access, viewerId, role) => {
        const f = fakes({ items: items(), role });
        expect(
          reasons(await loaded(f, context(f, access, viewerId), [1, 2, 3])),
        ).toEqual({
          "block-1": "withdrawn",
          "block-2": "withdrawn",
          "block-3": "withdrawn",
        });
        expect(f.storageSource).not.toHaveBeenCalled();
      },
    );

    it("is left out for every reader", async () => {
      for (const [viewerId, role] of [
        ["u2", "member"],
        ["u3", "moderator"],
        [null, null],
      ] as const) {
        const f = fakes({ items: items(), role });
        expect(
          await loadIssueItemViews(
            [block(1), block(2), block(3)],
            context(f, "full", viewerId),
          ),
        ).toEqual([]);
      }
    });
  });

  it("marks a gone item missing and an unfinished one not_ready", async () => {
    const f = fakes({
      items: [item(1, { status: "uploading" }), item(2, { status: "failed" })],
      role: "moderator",
    });
    expect(
      reasons(await loaded(f, context(f, "editor", "u3"), [1, 2, 3])),
    ).toEqual({
      "block-1": "not_ready",
      "block-2": "not_ready",
      "block-3": "missing",
    });
  });

  it("keeps a placed item of a deleted account, credited to a deleted member", async () => {
    const f = fakes({
      items: [item(1, { uploaderId: DELETED_AUTHOR_ID, mediaType: "video" })],
      role: "member",
    });
    const views = await loaded(f, context(f, "full", "u2"), [1]);
    expect(views.get("block-1")).toMatchObject({
      uploader: { name: "Deleted member" },
      label: {
        key: "gallery.label.videoFromEvent",
        values: { event: "Model night", name: "Deleted member" },
      },
    });
  });

  it("names an uploader without a name in the issue's language", async () => {
    const f = fakes({ items: [item(1, { uploaderId: "u4" })], role: "member" });
    const ctx = { ...context(f, "full", "u2"), locale: "nl" as const };
    const views = await loaded(f, ctx, [1]);
    expect(views.get("block-1")).toMatchObject({
      uploader: { name: "Lid" },
      label: { values: { name: "Lid" } },
    });
  });

  it("links public files directly and keeps the intro", async () => {
    const f = fakes({
      items: [item(1, { visibility: "public", event: null })],
      role: null,
    });
    const views = await galleryItemItemKind.load(
      [stored(1, { intro: "Our pick" })],
      context(f, "full", null),
    );
    expect(views.get("block-1")).toMatchObject({
      intro: "Our pick",
      url: "https://public.test/media/gallery/public/c1/u1.jpg",
      event: null,
      label: { key: "gallery.label.photoBy", values: { name: "Dana" } },
    });
    expect(f.storage.signedGetUrl).not.toHaveBeenCalled();
  });

  it("reaches nothing for an issue without gallery items", async () => {
    const f = fakes();
    expect((await loaded(f, context(f, "full", null), [])).size).toBe(0);
    expect(f.payload.find).not.toHaveBeenCalled();
    expect(f.communityRead).not.toHaveBeenCalled();
  });
});

describe("gallery item kind: openHrefs", () => {
  it("links each saved item the editor may read to its place in the gallery", async () => {
    const f = fakes({
      items: [
        item(1),
        item(2, { hiddenAt: "2026-11-13T12:00:00.000Z" }),
        item(3, { status: "uploading" }),
        item(6, { communityId: "c2" }),
      ],
      role: "member",
    });
    const hrefs = await galleryItemItemKind.openHrefs!(
      [1, 2, 3, 4, 6].map((id) => stored(id)),
      context(f, "editor", "u2"),
    );
    // Keyed by the content reference, like the picker's openHref.
    expect(hrefs).toEqual({
      "galleryItem:1": "/communities/town/gallery?item=1",
    });
    expect(
      f.payload.find.mock.calls.filter(
        ([args]) => args.collection === "gallery-items",
      ),
    ).toHaveLength(1);
  });

  it("links a hidden item for a moderator, who can open it in the gallery", async () => {
    const f = fakes({
      items: [item(2, { hiddenAt: "2026-11-13T12:00:00.000Z" })],
      role: "moderator",
    });
    expect(
      await galleryItemItemKind.openHrefs!(
        [stored(2)],
        context(f, "editor", "u3"),
      ),
    ).toEqual({ "galleryItem:2": "/communities/town/gallery?item=2" });
  });

  it("links nothing for an editor who is not signed in, and reads nothing", async () => {
    const f = fakes({ items: [item(1)], role: null });
    expect(
      await galleryItemItemKind.openHrefs!(
        [stored(1)],
        context(f, "editor", null),
      ),
    ).toEqual({});
    expect(f.payload.find).not.toHaveBeenCalled();
  });
});

describe("gallery item kind: validate", () => {
  // Item 1 is featurable; each other one fails one part of the rule.
  const seed = () => [
    item(1),
    item(2, { magazineConsent: false }),
    item(3, { hiddenAt: "2026-11-13T12:00:00.000Z" }),
    item(4, { status: "uploading" }),
    item(5, { uploaderId: DELETED_AUTHOR_ID }),
    item(6, { communityId: "c2" }),
    item(8, { visibility: "public" }),
  ];
  const isNew = (ids: number[], fresh = true) =>
    ids.map((id, index) => ({ index, stored: stored(id), isNew: fresh }));

  it("accepts only featurable items, whoever the editor is", async () => {
    const f = fakes({ items: seed(), role: "moderator" });
    const items = isNew([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(
      await galleryItemItemKind.validate(items, context(f, "editor", "u3")),
    ).toEqual(
      [1, 2, 3, 4, 5, 6].map((itemIndex) => ({
        itemIndex,
        code: "ITEM_INVALID",
      })),
    );
    expect(
      f.payload.find.mock.calls.filter(
        ([args]) => args.collection === "gallery-items",
      ),
    ).toHaveLength(1);
  });

  it("refuses a members-only item to an editor who may not read it", async () => {
    const f = fakes({ items: seed(), role: null });
    expect(
      await galleryItemItemKind.validate(
        isNew([1, 8]),
        context(f, "editor", "staff"),
      ),
    ).toEqual([{ itemIndex: 0, code: "ITEM_INVALID" }]);
  });

  it("keeps saved items and refuses a repeat", async () => {
    const f = fakes({ items: seed(), role: "member" });
    const ctx = context(f, "editor", "u2");
    expect(
      await galleryItemItemKind.validate(isNew([2, 3], false), ctx),
    ).toEqual([]);
    expect(f.payload.find).not.toHaveBeenCalled();
    expect(await galleryItemItemKind.validate(isNew([1, 1]), ctx)).toEqual([
      { itemIndex: 1, code: "ITEM_INVALID", detail: "duplicate" },
    ]);
  });

  it("refuses an issue-owned image on a gallery item, new or saved", async () => {
    const f = fakes({ items: seed(), role: "member" });
    const image = { url: "https://img.test/a.jpg" };
    expect(
      await galleryItemItemKind.validate(
        [
          { index: 0, stored: stored(1, { image }), isNew: true },
          { index: 1, stored: stored(8, { image }), isNew: false },
          {
            index: 2,
            stored: stored(8, { id: "b2", image: null }),
            isNew: false,
          },
        ],
        context(f, "editor", "u2"),
      ),
    ).toEqual([
      {
        itemIndex: 0,
        code: "ITEM_INVALID",
        detail: "gallery items can't carry their own image",
      },
      {
        itemIndex: 1,
        code: "ITEM_INVALID",
        detail: "gallery items can't carry their own image",
      },
      { itemIndex: 2, code: "ITEM_INVALID", detail: "duplicate" },
    ]);
  });
});

describe("Review Focus 3: picker, acceptNew and suggester share one predicate", () => {
  // Each item belongs to its own event that ended in the window, so the
  // suggester (one highlight per event) can offer every item it accepts.
  const seed = () =>
    [
      item(1),
      item(2, { magazineConsent: false }),
      item(3, { hiddenAt: "2026-11-13T12:00:00.000Z" }),
      item(4, { status: "uploading" }),
      item(5, { uploaderId: DELETED_AUTHOR_ID }),
      item(6, { communityId: "c2" }),
      item(7, { visibility: "public" }),
      item(8, { visibility: "public", magazineConsent: null }),
      item(9, { uploaderId: "u2", hiddenAt: "2026-11-13T12:00:00.000Z" }),
    ].map((doc): Doc => ({ ...doc, event: 100 + (doc.id as number) }));
  const events = () =>
    seed().map((doc) =>
      event(
        100 + (doc.id as number),
        `Event ${String(doc.id)}`,
        "2026-11-0" + String(doc.id),
      ),
    );

  it.each([
    ["a moderator", "u3", "moderator"],
    ["a member", "u2", "member"],
    ["an editor who is no member", "staff", null],
  ] as const)(
    "offers %s exactly what it would accept",
    async (_label, viewerId, role) => {
      const f = fakes({ items: seed(), events: events(), role });
      const ids = seed().map((doc) => doc.id as number);

      const problems = await galleryItemItemKind.validate(
        ids.map((id, index) => ({ index, stored: stored(id), isNew: true })),
        context(f, "editor", viewerId),
      );
      const refused = new Set(problems.map((p) => ids[p.itemIndex]));
      const accepted = ids.filter((id) => !refused.has(id));

      const picked = await searchPickerCandidates(
        "galleryItem",
        "",
        pickerContext(f, viewerId),
      );
      expect(
        picked.map((candidate) => candidate.input.galleryItemId).sort(),
      ).toEqual(accepted.sort());

      const suggested = await galleryItemSuggester.suggest(
        suggestContext(f, viewerId),
        WINDOW,
        { limit: 10, exclude: [] },
      );
      expect(
        suggested.map((candidate) => candidate.input.galleryItemId).sort(),
      ).toEqual(accepted.sort());

      const viewer: GalleryViewer = {
        userId: viewerId,
        communityId: "c1",
        isMember: role !== null,
        isModerator: role === "moderator",
        canSeePublic: true,
      };
      const where = featurableByWhere(viewer) as Where;
      for (const doc of seed()) {
        expect(
          isFeaturableBy(doc as never, viewer),
          `item ${String(doc.id)}`,
        ).toBe(matchesWhere(doc, where));
        expect(isFeaturableBy(doc as never, viewer)).toBe(
          accepted.includes(doc.id as number),
        );
      }
    },
  );

  it("keeps featurableWhere and isFeaturable in step", () => {
    const where = featurableWhere("c1") as Where;
    for (const doc of seed()) {
      expect(isFeaturable(doc as never, "c1"), `item ${String(doc.id)}`).toBe(
        matchesWhere(doc, where),
      );
    }
  });
});

describe("Review Focus 4: an issue stores only the gallery item's id", () => {
  it("drops any link the builder sends and keeps the trimmed intro", () => {
    const input = issueItemInputSchema.parse({
      kind: "galleryItem",
      galleryItemId: 7,
      intro: " Our pick ",
      url: "https://signed.test/private/gallery/c1/u7.jpg?X-Amz-Signature=x",
      thumbnailUrl: "https://signed.test/thumb.jpg",
    });
    expect(toStoredItems([input])).toEqual([
      { blockType: "galleryItem", galleryItemId: 7, intro: "Our pick" },
    ]);
  });

  it("round-trips numeric ids and refuses bad ones", () => {
    const saved = galleryItemItemKind.toStored({
      kind: "galleryItem",
      galleryItemId: 7,
    });
    expect(saved).toEqual({ galleryItemId: 7, intro: null });
    const fromPayload = {
      ...saved,
      id: "b7",
      galleryItemId: "7" as unknown as number,
    };
    expect(galleryItemItemKind.toInput(fromPayload)).toEqual({
      kind: "galleryItem",
      id: "b7",
      galleryItemId: 7,
    });
    expect(galleryItemItemKind.referenceOf(fromPayload)).toBe("galleryItem:7");
    for (const galleryItemId of [0, -1, 1.5])
      expect(
        galleryItemItemKind.input.safeParse({
          kind: "galleryItem",
          galleryItemId,
        }).success,
      ).toBe(false);
  });

  it("saves an explicit no-image as it is, with nothing to refuse", async () => {
    const f = fakes({ items: [item(1)], role: "member" });
    const [saved] = toStoredItems([
      issueItemInputSchema.parse({
        kind: "galleryItem",
        galleryItemId: 1,
        image: null,
      }),
    ]);
    expect(saved).toEqual({
      blockType: "galleryItem",
      galleryItemId: 1,
      intro: null,
      image: null,
    });
    expect(
      await validateIssueItems([saved!], context(f, "editor", "u2")),
    ).toEqual([]);
  });
});

describe("gallery item picker", () => {
  const seed = () => [
    item(1, { caption: "The keynote" }),
    item(2, { event: 6, mediaType: "video", durationSeconds: 42 }),
    item(3, { event: null, alt: "Pizza on the stage" }),
    item(4, { magazineConsent: false, caption: "The keynote, again" }),
  ];

  it("offers featurable items newest first, with thumbnails and gallery links", async () => {
    const f = fakes({ items: seed(), role: "member" });
    const candidates = await searchPickerCandidates(
      "galleryItem",
      "",
      pickerContext(f, "u2"),
    );
    expect(candidates).toEqual([
      {
        input: { kind: "galleryItem", galleryItemId: 3 },
        reference: "galleryItem:3",
        title: "Pizza on the stage",
        facts: [
          { type: "date", label: "added", at: "2026-11-13T12:00:00.000Z" },
          { type: "mediaType", mediaType: "photo" },
        ],
        thumbnailUrl: "https://signed.test/private/gallery/c1/u3-thumb.jpg",
        openHref: "/communities/town/gallery?item=3",
      },
      {
        input: { kind: "galleryItem", galleryItemId: 2 },
        reference: "galleryItem:2",
        title: "Video from Demo day by Dana",
        facts: [
          { type: "event", title: "Demo day" },
          { type: "date", label: "added", at: "2026-11-12T12:00:00.000Z" },
          { type: "mediaType", mediaType: "video" },
        ],
        thumbnailUrl: "https://signed.test/private/gallery/c1/u2-thumb.jpg",
        openHref: "/communities/town/gallery?item=2",
      },
      {
        input: { kind: "galleryItem", galleryItemId: 1 },
        reference: "galleryItem:1",
        title: "The keynote",
        facts: [
          { type: "event", title: "Model night" },
          { type: "date", label: "added", at: "2026-11-11T12:00:00.000Z" },
          { type: "mediaType", mediaType: "photo" },
        ],
        thumbnailUrl: "https://signed.test/private/gallery/c1/u1-thumb.jpg",
        openHref: "/communities/town/gallery?item=1",
      },
    ]);
    const search = f.payload.find.mock.calls.find(
      ([args]) => args.collection === "gallery-items",
    )![0];
    expect(search).toMatchObject({ sort: "-createdAt", limit: PICKER_LIMIT });
    // Only the thumbnails are linked: the picker shows nothing larger.
    expect(f.storage.signedGetUrl).not.toHaveBeenCalledWith(
      "private/gallery/c1/u1.jpg",
    );
  });

  it("matches the caption, the alt text and the event's title", async () => {
    const f = fakes({ items: seed(), role: "member" });
    const ctx = pickerContext(f, "u2");
    const found = async (query: string) =>
      (await searchPickerCandidates("galleryItem", query, ctx)).map(
        (candidate) => candidate.input.galleryItemId,
      );
    expect(await found("keynote")).toEqual([1]);
    expect(await found("pizza")).toEqual([3]);
    expect(await found("demo")).toEqual([2]);
    expect(await found("nothing like it")).toEqual([]);
    const eventSearch = f.payload.find.mock.calls.find(
      ([args]) => args.collection === "events",
    )![0];
    expect(eventSearch.where).toEqual({
      and: [{ communityId: { equals: "c1" } }, { title: { like: "keynote" } }],
    });
  });

  it("leaves out what the issue holds and reaches no storage for nothing", async () => {
    const f = fakes({ items: seed(), role: "member" });
    expect(
      await searchPickerCandidates("galleryItem", "", pickerContext(f, "u2"), [
        "galleryItem:1",
        "galleryItem:2",
        "galleryItem:3",
        "event:3",
      ]),
    ).toEqual([]);
    expect(f.storageSource).not.toHaveBeenCalled();
  });

  it("offers an editor who is no member only public items", async () => {
    const f = fakes({
      items: [...seed(), item(7, { visibility: "public" })],
      role: null,
    });
    const candidates = await searchPickerCandidates(
      "galleryItem",
      "",
      pickerContext(f, "staff"),
    );
    expect(candidates.map((c) => c.input.galleryItemId)).toEqual([7]);
    expect(candidates[0]!.thumbnailUrl).toBe(
      "https://public.test/media/gallery/public/c1/u7-thumb.jpg",
    );
  });
});
