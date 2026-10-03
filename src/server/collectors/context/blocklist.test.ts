import { describe, expect, it } from "vitest";
import { isBlockedHost } from "./blocklist";

const blocked = new Set(["example.com", "news.site.org"]);

describe("isBlockedHost", () => {
  it.each([
    ["example.com", true],
    ["www.example.com", true],
    ["a.b.example.com", true],
    ["EXAMPLE.com.", true],
    ["notexample.com", false],
    ["example.co", false],
    ["site.org", false],
    ["news.site.org", true],
  ])("%s → %s", (host, expected) => {
    expect(isBlockedHost(host, blocked)).toBe(expected);
  });
});
