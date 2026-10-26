import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

import { ITEM_KINDS } from "@/server/magazines/items/registry";

import { ITEM_RENDERERS } from "../../../items/registry";
import type { BuilderItem } from "../items-model";
import {
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

  it("names each kind by its own label, never a fallback", () => {
    expect(builderKindLabelKey(article)).toBe("article");
    expect(builderKindLabelKey(editorial)).toBe("editorial");
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
