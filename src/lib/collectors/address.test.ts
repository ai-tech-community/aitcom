import { describe, expect, it } from "vitest";

import { MAX_ADDRESS_LENGTH, parseAddress } from "./address";

describe("parseAddress", () => {
  it.each([
    ["https://example.com/jobs", "https://example.com/jobs"],
    ["  https://example.com/jobs  ", "https://example.com/jobs"],
    ["example.com/jobs", "https://example.com/jobs"],
    ["boards.greenhouse.io/acme", "https://boards.greenhouse.io/acme"],
    ["http://example.com/", "http://example.com/"],
    ["HTTPS://Example.COM/a?b=1#c", "https://example.com/a?b=1#c"],
  ])("reads %j as %s", (text, href) => {
    expect(parseAddress(text)?.href).toBe(href);
  });

  it.each([
    "",
    "   ",
    "hello world",
    "javascript:alert(1)",
    "mailto:a@b.nl",
    "ftp://example.com/file",
    "localhost:3000",
    "https://localhost/",
    "https://user:pw@example.com/",
    "https://exa mple.com/",
    `https://example.com/${"a".repeat(MAX_ADDRESS_LENGTH)}`,
  ])("refuses %j", (text) => {
    expect(parseAddress(text)).toBeNull();
  });
});
