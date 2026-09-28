import { describe, expect, it } from "vitest";
import { isResourceUrl, RESOURCE_URL_MAX_LENGTH } from "./resource-url";

describe("isResourceUrl", () => {
  it.each([
    "https://example.com/slides",
    "http://example.com",
    "mailto:teacher@example.com",
    "ftp://files.example.com/notes.pdf",
  ])("accepts a full address: %s", (url) => {
    expect(isResourceUrl(url)).toBe(true);
  });

  it.each([
    "",
    "example.com",
    "/relative/path",
    "https://",
    "https://exa mple.com",
    " https://example.com",
  ])("refuses what is not a full address: %j", (url) => {
    expect(isResourceUrl(url)).toBe(false);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,hi",
    "vbscript:x",
  ])(
    "refuses a link that would run code instead of opening a page: %s",
    (url) => {
      expect(isResourceUrl(url)).toBe(false);
    },
  );

  it("refuses an address longer than the server stores", () => {
    const base = "https://example.com/";
    expect(
      isResourceUrl(base + "a".repeat(RESOURCE_URL_MAX_LENGTH - base.length)),
    ).toBe(true);
    expect(
      isResourceUrl(
        base + "a".repeat(RESOURCE_URL_MAX_LENGTH - base.length + 1),
      ),
    ).toBe(false);
  });
});
