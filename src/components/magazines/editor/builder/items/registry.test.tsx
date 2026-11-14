import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
vi.mock("@/trpc/react", () => ({ api: {} }));

import { ITEM_KINDS } from "@/server/magazines/items/registry";
import type { InputOf } from "@/server/magazines/items/registry";
import type { StoredItem } from "@/server/magazines/items/types";
import type { ItemKindId } from "@/lib/magazines/item-views";
import { newItemImage } from "@/lib/magazines/item-image";
import { PICKABLE_ITEM_KINDS } from "@/lib/magazines/picker";

import {
  eventView,
  launchpadProjectView,
  forumThreadView,
  galleryItemView,
  newsItemView,
  storylineView,
} from "../../../test-fixtures";
import { ITEM_RENDERERS } from "../../../items/registry";
import { translateEn as translate } from "../../../test-intl";
import type { BuilderItem } from "../items-model";
import {
  acceptsBuilderItemImage,
  ADD_TAB_ORDER,
  BUILDER_ITEM_KINDS,
  builderKindLabelKey,
  builderOpenLabelKey,
  builderPreviewView,
  builderReferenceKey,
  builderRowTitle,
  hasBuilderItemEditor,
  isSavableBuilderItem,
} from "./registry";

const t = (key: string) => `[${key}]`;

const textBody = (text: string) => ({
  root: {
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", text }] }],
  },
});

const article: BuilderItem = { kind: "article", key: "a", articleId: 7 };
const editorial: BuilderItem = {
  kind: "editorial",
  key: "e",
  heading: "From the editor",
  body: textBody("Welcome"),
};

const referenceInputs: { [K in ItemKindId]: InputOf<K> } = {
  article: { kind: "article", articleId: 7 },
  editorial: { kind: "editorial", body: textBody("Welcome") },
  storyline: { kind: "storyline", storylineId: "story-id" },
  newsItem: { kind: "newsItem", newsItemId: "news-id" },
  event: { kind: "event", eventId: 7 },
  forumThread: { kind: "forumThread", threadId: 7 },
  launchpadProject: { kind: "launchpadProject", projectId: 7 },
  galleryItem: { kind: "galleryItem", galleryItemId: 7 },
};

function referenceParity<K extends ItemKindId>(kind: K) {
  const input = referenceInputs[kind];
  const strategy = ITEM_KINDS[kind];
  // These generic boundaries hide fields that the checked fixture map supplies.
  const stored = strategy.toStored(input) as StoredItem<K>;
  const builderItem = { ...input, key: "x" } as unknown as BuilderItem;
  expect(strategy.referenceOf(stored)).toBe(builderReferenceKey(builderItem));
}

describe("builder item registry", () => {
  it.each([...PICKABLE_ITEM_KINDS, "editorial"] as const)(
    "shares the %s reference identity with its server strategy",
    referenceParity,
  );
  it("has one builder strategy per item kind, the same kinds as the server and the renderers", () => {
    const kinds = Object.keys(BUILDER_ITEM_KINDS).sort();
    expect(kinds).toEqual(Object.keys(ITEM_KINDS).sort());
    expect(kinds).toEqual(Object.keys(ITEM_RENDERERS).sort());
  });

  it("offers one add tab per kind", () => {
    expect([...ADD_TAB_ORDER].sort()).toEqual(
      Object.keys(BUILDER_ITEM_KINDS).sort(),
    );
  });

  it("names each kind by its own label, never a fallback", () => {
    expect(builderKindLabelKey(article)).toBe("article");
    expect(builderKindLabelKey(editorial)).toBe("editorial");
  });

  it("adds stories after articles and follows their saved title and edited intro", () => {
    expect(ADD_TAB_ORDER).toEqual([
      "article",
      "storyline",
      "newsItem",
      "event",
      "galleryItem",
      "forumThread",
      "launchpadProject",
      "editorial",
    ]);
    const item: BuilderItem = {
      kind: "storyline",
      key: "story",
      storylineId: "s1",
      intro: "Our take",
    };
    const saved = storylineView();
    expect(builderKindLabelKey(item)).toBe("storyline");
    expect(builderReferenceKey(item)).toBe("storyline:s1");
    expect(
      builderRowTitle(item, { saved, titleHint: "Old title", t, translate }),
    ).toBe("Story 1");
    expect(builderPreviewView(item, undefined)).toBeNull();
    expect(builderPreviewView(item, saved)).toEqual({
      ...saved,
      itemId: "story",
      intro: "Our take",
    });
    expect(isSavableBuilderItem(item)).toBe(true);
    expect(hasBuilderItemEditor(item)).toBe(false);
  });

  it("adds news after stories and follows the saved headline and edited intro", () => {
    const item: BuilderItem = {
      kind: "newsItem",
      key: "news",
      newsItemId: "n1",
      intro: "Our take",
    };
    const saved = newsItemView();
    expect(builderKindLabelKey(item)).toBe("newsItem");
    expect(builderReferenceKey(item)).toBe("newsItem:n1");
    expect(
      builderRowTitle(item, { saved, titleHint: "Old title", t, translate }),
    ).toBe("Headline 1");
    expect(builderPreviewView(item, undefined)).toBeNull();
    expect(builderPreviewView(item, saved)).toEqual({
      ...saved,
      itemId: "news",
      intro: "Our take",
    });
    expect(isSavableBuilderItem(item)).toBe(true);
    expect(hasBuilderItemEditor(item)).toBe(false);
  });

  it("dispatches row titles, saving rules, previews and references per kind", () => {
    const ctx = { saved: undefined, titleHint: undefined, t, translate };
    expect(builderRowTitle(article, ctx)).toBe("[article]");
    expect(builderRowTitle(article, { ...ctx, titleHint: "Evals" })).toBe(
      "Evals",
    );
    expect(builderRowTitle(editorial, ctx)).toBe("From the editor");
    expect(
      builderRowTitle({ ...editorial, heading: undefined, body: null }, ctx),
    ).toBe("[editorialEmpty]");

    expect(isSavableBuilderItem(article)).toBe(true);
    expect(isSavableBuilderItem({ ...editorial, body: textBody(" ") })).toBe(
      false,
    );

    // An article waits for its first save; an editorial block shows at once.
    expect(builderPreviewView(article, undefined)).toBeNull();
    expect(builderPreviewView(editorial, undefined)).toMatchObject({
      kind: "editorial",
      itemId: "e",
      heading: "From the editor",
    });

    expect(builderReferenceKey(article)).toBe("article:7");
    expect(builderReferenceKey(editorial)).toBeNull();
    expect(hasBuilderItemEditor(article)).toBe(false);
    expect(hasBuilderItemEditor(editorial)).toBe(true);
  });
});

it("adds events after news and follows the saved event and edited intro", () => {
  const item: BuilderItem = {
    kind: "event",
    key: "event",
    eventId: 7,
    intro: "Join us",
  };
  const saved = eventView();
  expect(ADD_TAB_ORDER.indexOf("event")).toBe(
    ADD_TAB_ORDER.indexOf("newsItem") + 1,
  );
  expect(builderKindLabelKey(item)).toBe("event");
  expect(builderReferenceKey(item)).toBe("event:7");
  expect(
    builderRowTitle(item, { saved, titleHint: "Old title", t, translate }),
  ).toBe("Event 1");
  expect(builderPreviewView(item, saved)).toEqual({
    ...saved,
    itemId: "event",
    intro: "Join us",
  });
  expect(isSavableBuilderItem(item)).toBe(true);
  expect(hasBuilderItemEditor(item)).toBe(false);
});

it("adds gallery items after events, titled by their translated label and never with an issue image", () => {
  const item: BuilderItem = {
    kind: "galleryItem",
    key: "gallery",
    galleryItemId: 7,
    intro: "Our pick",
  };
  const saved = galleryItemView(7, {
    caption: null,
    alt: null,
    label: { key: "gallery.label.photoBy", values: { name: "Sanne" } },
  });
  expect(ADD_TAB_ORDER.indexOf("galleryItem")).toBe(
    ADD_TAB_ORDER.indexOf("event") + 1,
  );
  expect(builderKindLabelKey(item)).toBe("galleryItem");
  expect(builderReferenceKey(item)).toBe("galleryItem:7");
  // A saved item's row menu opens it in the gallery (the server's openHrefs).
  expect(builderOpenLabelKey(item)).toBe("openGalleryItem");
  expect(
    builderRowTitle(item, { saved, titleHint: "Old title", t, translate }),
  ).toBe("Photo by Sanne");
  expect(
    builderRowTitle(item, {
      saved: undefined,
      titleHint: "Robots on stage",
      t,
      translate,
    }),
  ).toBe("Robots on stage");
  expect(builderPreviewView(item, undefined)).toBeNull();
  expect(builderPreviewView(item, saved)).toEqual({
    ...saved,
    itemId: "gallery",
    intro: "Our pick",
  });
  expect(isSavableBuilderItem(item)).toBe(true);
  expect(hasBuilderItemEditor(item)).toBe(false);
  expect(acceptsBuilderItemImage(item)).toBe(false);
  // An image left on the working copy (say, from an older draft) never
  // reaches the preview: the server would refuse it.
  const withImage = {
    ...item,
    image: newItemImage("https://example.test/i.jpg"),
  };
  expect(builderPreviewView(withImage, saved)).not.toHaveProperty(
    "image",
    expect.anything(),
  );
});

it("lets every other kind carry an issue image", () => {
  for (const kind of ADD_TAB_ORDER.filter((kind) => kind !== "galleryItem")) {
    expect(BUILDER_ITEM_KINDS[kind].acceptsImage ?? true).toBe(true);
  }
});

it("adds forum threads after gallery items and follows the saved title and edited intro", () => {
  const item: BuilderItem = {
    kind: "forumThread",
    key: "thread",
    threadId: 7,
    intro: "Our discussion",
  };
  const saved = forumThreadView();
  expect(ADD_TAB_ORDER.indexOf("forumThread")).toBe(
    ADD_TAB_ORDER.indexOf("galleryItem") + 1,
  );
  expect(builderKindLabelKey(item)).toBe("forumThread");
  expect(builderReferenceKey(item)).toBe("forumThread:7");
  expect(
    builderRowTitle(item, { saved, titleHint: "Old title", t, translate }),
  ).toBe("Thread 1");
  expect(builderPreviewView(item, undefined)).toBeNull();
  expect(builderPreviewView(item, saved)).toEqual({
    ...saved,
    itemId: "thread",
    intro: "Our discussion",
  });
  expect(isSavableBuilderItem(item)).toBe(true);
  expect(hasBuilderItemEditor(item)).toBe(false);
});

it("adds projects last before editorial and follows the saved title and edited intro", () => {
  const item: BuilderItem = {
    kind: "launchpadProject",
    key: "project",
    projectId: 7,
    intro: "Our pick",
  };
  const saved = launchpadProjectView();
  expect(ADD_TAB_ORDER.indexOf("launchpadProject")).toBe(
    ADD_TAB_ORDER.indexOf("editorial") - 1,
  );
  expect(builderKindLabelKey(item)).toBe("launchpadProject");
  expect(builderReferenceKey(item)).toBe("launchpadProject:7");
  expect(
    builderRowTitle(item, { saved, titleHint: "Old title", t, translate }),
  ).toBe("Project 1");
  expect(builderPreviewView(item, undefined)).toBeNull();
  expect(builderPreviewView(item, saved)).toEqual({
    ...saved,
    itemId: "project",
    intro: "Our pick",
  });
  expect(isSavableBuilderItem(item)).toBe(true);
  expect(hasBuilderItemEditor(item)).toBe(false);
});
