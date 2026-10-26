import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
vi.mock("@/trpc/react", () => ({ api: {} }));

import { ITEM_KINDS } from "@/server/magazines/items/registry";

import {
  eventView,
  forumThreadView,
  newsItemView,
  storylineView,
} from "../../../test-fixtures";
import { ITEM_RENDERERS } from "../../../items/registry";
import type { BuilderItem } from "../items-model";
import {
  ADD_TAB_ORDER,
  BUILDER_ITEM_KINDS,
  builderKindLabelKey,
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

describe("builder item registry", () => {
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
      "forumThread",
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
    expect(builderRowTitle(item, { saved, titleHint: "Old title", t })).toBe(
      "Story 1",
    );
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
    expect(builderRowTitle(item, { saved, titleHint: "Old title", t })).toBe(
      "Headline 1",
    );
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
    const ctx = { saved: undefined, titleHint: undefined, t };
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
  expect(builderRowTitle(item, { saved, titleHint: "Old title", t })).toBe(
    "Event 1",
  );
  expect(builderPreviewView(item, saved)).toEqual({
    ...saved,
    itemId: "event",
    intro: "Join us",
  });
  expect(isSavableBuilderItem(item)).toBe(true);
  expect(hasBuilderItemEditor(item)).toBe(false);
});

it("adds forum threads after events and follows the saved title and edited intro", () => {
  const item: BuilderItem = {
    kind: "forumThread",
    key: "thread",
    threadId: 7,
    intro: "Our discussion",
  };
  const saved = forumThreadView();
  expect(ADD_TAB_ORDER.indexOf("forumThread")).toBe(
    ADD_TAB_ORDER.indexOf("event") + 1,
  );
  expect(builderKindLabelKey(item)).toBe("forumThread");
  expect(builderReferenceKey(item)).toBe("forumThread:7");
  expect(builderRowTitle(item, { saved, titleHint: "Old title", t })).toBe(
    "Thread 1",
  );
  expect(builderPreviewView(item, undefined)).toBeNull();
  expect(builderPreviewView(item, saved)).toEqual({
    ...saved,
    itemId: "thread",
    intro: "Our discussion",
  });
  expect(isSavableBuilderItem(item)).toBe(true);
  expect(hasBuilderItemEditor(item)).toBe(false);
});
