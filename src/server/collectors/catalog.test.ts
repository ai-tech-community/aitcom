import { describe, expect, it } from "vitest";
import { z } from "zod";
import { allCollectors, columnsOf, getCollector } from "./catalog";

describe("collector catalog", () => {
  const collectors = allCollectors();

  it("has unique kebab-case ids", () => {
    const ids = collectors.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it.each(allCollectors().map((c) => [c.id, c] as const))(
    "%s is complete and consistent",
    (_id, c) => {
      for (const text of [c.title, c.description]) {
        expect(text.en.trim()).not.toBe("");
        expect(text.nl.trim()).not.toBe("");
      }
      expect(c.inputSchema).toBeInstanceOf(z.ZodObject);
      expect(c.itemSchema).toBeInstanceOf(z.ZodObject);
      const inputKeys = Object.keys(
        (c.inputSchema as z.ZodObject).shape,
      ).sort();
      expect(Object.keys(c.fieldHints).sort()).toEqual(inputKeys);
      for (const hint of Object.values(c.fieldHints)) {
        expect(hint.label.en.trim()).not.toBe("");
        expect(hint.label.nl.trim()).not.toBe("");
      }
      expect(c.itemSchema.safeParse(c.sampleItem).success).toBe(true);
      expect(() => z.toJSONSchema(c.inputSchema)).not.toThrow();
      expect(c.limits.maxPages).toBeGreaterThan(0);
      expect(c.limits.maxItems).toBeGreaterThan(0);
      expect(c.limits.maxItems).toBeLessThanOrEqual(5_000);
      expect(c.limits.maxDurationMs).toBeLessThanOrEqual(240_000);
      expect(columnsOf(c)).toEqual(Object.keys(c.sampleItem));
    },
  );

  it("hides a switched-off collector", () => {
    expect(getCollector("feed-items")?.id).toBe("feed-items");
    expect(getCollector("feed-items", new Set(["feed-items"]))).toBeUndefined();
    expect(getCollector("nope")).toBeUndefined();
  });
});
