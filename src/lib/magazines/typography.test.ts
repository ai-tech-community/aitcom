import { describe, expect, it } from "vitest";
import {
  isMagazineReadingPath,
  MAGAZINE_FONTS,
  resolveMagazineFont,
} from "./typography";

describe("magazine display font", () => {
  it.each(MAGAZINE_FONTS)("resolves the supported font %s", (font) => {
    expect(resolveMagazineFont(font)).toBe(font);
  });
  it.each([undefined, null, "", "unknown", "url(https://example.test)"])(
    "uses the default for %s",
    (font) => {
      expect(resolveMagazineFont(font)).toBe("italiana");
    },
  );
});

describe("publication chrome routes", () => {
  it.each([
    "/magazines/gazette/issue-1",
    "/magazines/gazette/issue-1/",
    "/magazines/gazette/issue-1/story",
  ])("uses the publication shell for %s", (path) => {
    expect(isMagazineReadingPath(path)).toBe(true);
  });
  it.each([
    "/magazines",
    "/magazines/gazette",
    "/magazine-subscriptions/confirm",
    "/communities/builders/magazine",
    "/magazines/gazette/issue/story/extra",
    "/news",
  ])("keeps the site frame for %s", (path) => {
    expect(isMagazineReadingPath(path)).toBe(false);
  });
});
