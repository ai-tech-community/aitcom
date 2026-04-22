import { describe, expect, it } from "vitest";
import { normalizeWebsite } from "./normalize-website";

describe("normalizeWebsite", () => {
  it("prepends https:// when missing", () => {
    expect(normalizeWebsite("reddit.com")).toBe("https://reddit.com");
  });

  it("keeps https:// prefix", () => {
    expect(normalizeWebsite("https://reddit.com")).toBe("https://reddit.com");
  });

  it("upgrades http:// to https://", () => {
    expect(normalizeWebsite("http://reddit.com")).toBe("https://reddit.com");
  });

  it("trims whitespace", () => {
    expect(normalizeWebsite("  https://reddit.com  ")).toBe("https://reddit.com");
  });

  it("strips trailing slash", () => {
    expect(normalizeWebsite("https://reddit.com/")).toBe("https://reddit.com");
  });

  it("keeps path components intact", () => {
    expect(normalizeWebsite("https://example.com/brand")).toBe(
      "https://example.com/brand",
    );
  });

  it("returns null for empty/null/undefined", () => {
    expect(normalizeWebsite("")).toBeNull();
    expect(normalizeWebsite(null)).toBeNull();
    expect(normalizeWebsite(undefined)).toBeNull();
  });

  it("returns null for obvious non-domains", () => {
    expect(normalizeWebsite("not a url")).toBeNull();
    expect(normalizeWebsite("foo")).toBeNull();
    expect(normalizeWebsite("foo.")).toBeNull();
  });

  it("lowercases the hostname but not the path", () => {
    expect(normalizeWebsite("https://Reddit.COM/SubReddit")).toBe(
      "https://reddit.com/SubReddit",
    );
  });

  it("rejects hostnames with no dot", () => {
    expect(normalizeWebsite("localhost")).toBeNull();
  });

  it("rejects strings with spaces", () => {
    expect(normalizeWebsite("red dit.com")).toBeNull();
  });
});
