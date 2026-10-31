import { afterEach, describe, expect, it, vi } from "vitest";

import { allPresets } from "./catalog";
import type { AnyPreset } from "./preset";
import { recognizePreset } from "./recognize";

function preset(
  id: string,
  recognize?: (url: URL) => Record<string, unknown> | null,
): AnyPreset {
  return {
    id,
    group: id === "custom-page" ? "custom" : "research",
    title: { en: id, nl: id },
    summary: { en: id, nl: id },
    collectorId: "feed-items",
    base: {},
    ask: ["url"],
    ...(recognize ? { recognize } : {}),
  };
}

const custom = preset("custom-page");
const url = (href: string) => new URL(href);

afterEach(() => vi.restoreAllMocks());

describe("recognizePreset", () => {
  it("recognises Ashby with the real preset catalog and leaves near misses custom", () => {
    expect(
      recognizePreset(url("https://jobs.ashbyhq.com/Ashby"), allPresets()),
    ).toEqual({
      presetId: "ashby-board",
      input: { name: "Ashby" },
      matched: true,
    });
    expect(
      recognizePreset(url("https://ashbyhq.com/jobs"), allPresets()),
    ).toEqual({
      presetId: "custom-page",
      input: { url: "https://ashbyhq.com/jobs" },
      matched: false,
    });
  });
  it("takes the first preset, in catalog order, that recognises the address", () => {
    const presets = [
      preset("no", () => null),
      preset("first", (u) =>
        u.hostname === "boards.example.com" ? { name: "acme" } : null,
      ),
      preset("second", () => ({ name: "other" })),
      custom,
    ];
    expect(
      recognizePreset(url("https://boards.example.com/acme"), presets),
    ).toEqual({
      presetId: "first",
      input: { name: "acme" },
      matched: true,
    });
  });

  it("opens the Custom page with the address when nothing recognises it", () => {
    expect(
      recognizePreset(url("https://example.com/jobs?page=2"), [
        preset("no", () => null),
        custom,
      ]),
    ).toEqual({
      presetId: "custom-page",
      input: { url: "https://example.com/jobs?page=2" },
      matched: false,
    });
  });

  it("skips a recognizer that throws, and says so in the log", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const presets = [
      preset("broken", () => {
        throw new Error("boom");
      }),
      custom,
    ];
    expect(
      recognizePreset(url("https://example.com/"), presets)?.presetId,
    ).toBe("custom-page");
    expect(log).toHaveBeenCalledOnce();
  });

  it("gives each recognizer its own copy of the address", () => {
    const presets = [
      preset("mutates", (u) => {
        u.hostname = "evil.example";
        return null;
      }),
      preset("reads", (u) => ({ host: u.hostname })),
      custom,
    ];
    expect(
      recognizePreset(url("https://example.com/"), presets)?.input,
    ).toEqual({
      host: "example.com",
    });
  });

  it("has nowhere to go when the Custom page is unavailable", () => {
    expect(
      recognizePreset(url("https://example.com/"), [preset("no", () => null)]),
    ).toBeNull();
  });

  it("recognises Greenhouse boards from the live catalog", () => {
    expect(
      recognizePreset(url("https://boards.greenhouse.io/acme"), allPresets()),
    ).toEqual({
      presetId: "greenhouse-board",
      input: { name: "acme" },
      matched: true,
    });
  });
});
