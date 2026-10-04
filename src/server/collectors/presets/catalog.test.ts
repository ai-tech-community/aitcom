import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  CUSTOM_PAGE_PRESET_ID,
  PRESET_GROUPS,
  formerStartIds,
} from "@/lib/collectors/presets";
import { checkSelector } from "@/lib/collectors/selector-policy";
import { RECOGNISED_PARAM } from "@/lib/collectors/start-address";

import { allCollectors, getCollector } from "../catalog";
import { allPresets, getPreset } from "./catalog";

/**
 * What a member would type into each preset's asked fields. Every preset
 * needs an entry: the test proves `base` plus these answers is a valid input.
 */
const ASK_SAMPLES: Record<string, Record<string, unknown>> = {
  feed: { url: "https://example.com/feed.xml" },
  "custom-page": {
    url: "https://example.com/jobs",
    itemSelector: "li.job",
    fields: [{ name: "title", selector: "h3" }],
  },
};

function inputNames(collectorId: string): string[] {
  const collector = getCollector(collectorId)!;
  return Object.keys((collector.inputSchema as z.ZodObject).shape);
}

/** Every selector a page-list input gives the allowlist. */
function selectorsOf(input: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ["itemSelector", "nextPageSelector"]) {
    const value = input[key];
    if (typeof value === "string") out.push(value);
  }
  if (Array.isArray(input.fields)) {
    for (const field of input.fields as { selector?: unknown }[]) {
      if (typeof field.selector === "string" && field.selector.trim()) {
        out.push(field.selector);
      }
    }
  }
  return out;
}

describe("preset catalog", () => {
  const presets = allPresets();

  it("has unique kebab-case ids", () => {
    const ids = presets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it.each(presets.map((p) => [p.id, p] as const))(
    "%s is complete and consistent",
    (id, preset) => {
      const collector = getCollector(preset.collectorId);
      expect(collector, "collectorId names a collector").toBeDefined();
      for (const text of [preset.title, preset.summary]) {
        expect(text.en.trim()).not.toBe("");
        expect(text.nl.trim()).not.toBe("");
      }
      expect(PRESET_GROUPS).toContain(preset.group);

      const names = inputNames(preset.collectorId);
      expect(preset.ask.length).toBeGreaterThan(0);
      for (const name of preset.ask) expect(names).toContain(name);
      for (const name of Object.keys(preset.base))
        expect(names).toContain(name);
      for (const name of Object.keys(preset.hints ?? {})) {
        expect(names).toContain(name);
      }

      const sample = ASK_SAMPLES[id];
      expect(sample, `add ${id} to ASK_SAMPLES`).toBeDefined();
      for (const name of Object.keys(sample!)) {
        expect(preset.ask).toContain(name);
      }
      const parsed = collector!.inputSchema.safeParse({
        ...preset.base,
        ...sample,
      });
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);

      if (preset.collectorId === "page-list") {
        for (const selector of selectorsOf(
          preset.base as Record<string, unknown>,
        )) {
          expect(checkSelector(selector), selector).toEqual({ ok: true });
        }
      }
    },
  );

  it("ends with one Custom page that asks for every page-list input", () => {
    expect(
      presets.filter((p) => p.group === "custom").map((p) => p.id),
    ).toEqual([CUSTOM_PAGE_PRESET_ID]);
    expect(presets.at(-1)?.id).toBe(CUSTOM_PAGE_PRESET_ID);
    const custom = getPreset(CUSTOM_PAGE_PRESET_ID)!;
    expect(custom.collectorId).toBe("page-list");
    expect([...custom.ask].sort()).toEqual(inputNames("page-list").sort());
    expect(custom.recognize).toBeUndefined();
  });

  it("offers a start for every collector", () => {
    for (const collector of allCollectors()) {
      expect(
        presets.some((p) => p.collectorId === collector.id),
        collector.id,
      ).toBe(true);
    }
  });

  it("maps every former start id to a preset of that same collector", () => {
    for (const [former, presetId] of Object.entries(formerStartIds())) {
      expect(getCollector(former), former).toBeDefined();
      expect(getPreset(presetId)?.collectorId).toBe(former);
      // A former id must never become a preset id: its address redirects.
      expect(getPreset(former)).toBeUndefined();
    }
  });

  it("names no collector input like the start page's reserved query key", () => {
    for (const collector of allCollectors()) {
      expect(inputNames(collector.id), collector.id).not.toContain(
        RECOGNISED_PARAM,
      );
    }
  });

  it("finds nothing for an unknown id", () => {
    expect(getPreset("nope")).toBeUndefined();
    expect(getPreset("constructor")).toBeUndefined();
  });
});
