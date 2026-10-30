import { describe, expect, it } from "vitest";

import {
  magazineArticleSlugBase,
  nextMagazineArticleSlug,
} from "./article-slug";

describe("nextMagazineArticleSlug", () => {
  it("uses the title, with no timestamp", () => {
    expect(nextMagazineArticleSlug("Getting Started with AI", new Set())).toBe(
      "getting-started-with-ai",
    );
    expect(magazineArticleSlugBase("Getting Started with AI")).not.toMatch(
      /\d{13}/,
    );
  });

  it("adds a short number only when the magazine already has that slug", () => {
    const taken = new Set(["night-owls", "night-owls-2"]);
    expect(nextMagazineArticleSlug("Night owls", taken)).toBe("night-owls-3");
  });

  it("falls back when the title has no usable words", () => {
    expect(nextMagazineArticleSlug("!!!", new Set())).toBe("article");
    expect(nextMagazineArticleSlug("!!!", new Set(["article"]))).toBe(
      "article-2",
    );
  });
});
