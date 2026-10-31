import { describe, expect, it } from "vitest";
import { canonicalOptOutDomain } from "./opt-out-domain";
describe("opt-out domain input", () => {
  it.each([
    [" Example.ORG. ", "example.org"],
    ["bücher.de", "xn--bcher-kva.de"],
    ["jobs.example.org", "jobs.example.org"],
  ])("canonicalizes %s", (input, expected) =>
    expect(canonicalOptOutDomain(input)).toBe(expected),
  );
  it.each([
    "https://example.org",
    "example.org/path",
    "example.org:443",
    "*.example.org",
    "user@example.org",
    "localhost",
    "127.0.0.1",
    "[::1]",
    "-bad.org",
    "bad..org",
    "example.org?x",
    "example.org#x",
  ])("refuses %s", (input) => expect(canonicalOptOutDomain(input)).toBeNull());
});
