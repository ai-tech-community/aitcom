import { describe, expect, it } from "vitest";
import { z } from "zod";
import { allCollectors, columnsOf, getCollector } from "./catalog";
import type { FieldHint } from "./collector";

function expectLabelled(hint: FieldHint) {
  expect(hint.label.en.trim()).not.toBe("");
  expect(hint.label.nl.trim()).not.toBe("");
}

/** The object schema of an array field's rows, or null for other fields. */
function rowShape(field: z.ZodType): z.ZodObject | null {
  let inner: z.ZodType = field;
  while (inner instanceof z.ZodOptional || inner instanceof z.ZodDefault) {
    inner = inner.unwrap() as z.ZodType;
  }
  return inner instanceof z.ZodArray && inner.element instanceof z.ZodObject
    ? inner.element
    : null;
}

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
      // Fixed columns (an object) or columns the member names (a record).
      const dynamicColumns = c.itemSchema instanceof z.ZodRecord;
      if (!dynamicColumns) expect(c.itemSchema).toBeInstanceOf(z.ZodObject);
      const shape = (c.inputSchema as z.ZodObject).shape as Record<
        string,
        z.ZodType
      >;
      const hints = c.fieldHints as Record<string, FieldHint>;
      expect(Object.keys(hints).sort()).toEqual(Object.keys(shape).sort());
      for (const [name, hint] of Object.entries(hints)) {
        expectLabelled(hint);
        const row = rowShape(shape[name]!);
        if (!row) {
          expect(hint.columns).toBeUndefined();
          continue;
        }
        expect(Object.keys(hint.columns ?? {}).sort()).toEqual(
          Object.keys(row.shape).sort(),
        );
        for (const column of Object.values(hint.columns ?? {})) {
          expectLabelled(column);
        }
      }
      expect(c.itemSchema.safeParse(c.sampleItem).success).toBe(true);
      expect(() => z.toJSONSchema(c.inputSchema)).not.toThrow();
      expect(c.limits.maxPages).toBeGreaterThan(0);
      expect(c.limits.maxItems).toBeGreaterThan(0);
      expect(c.limits.maxItems).toBeLessThanOrEqual(5_000);
      expect(c.limits.maxDurationMs).toBeLessThanOrEqual(240_000);
      expect(columnsOf(c)).toEqual(
        dynamicColumns ? null : Object.keys(c.sampleItem),
      );
    },
  );

  it("lists the page-list collector, whose columns the member names", () => {
    const pageList = getCollector("page-list");
    expect(pageList?.itemSchema).toBeInstanceOf(z.ZodRecord);
    expect(pageList && columnsOf(pageList)).toBeNull();
  });

  it("hides a switched-off collector", () => {
    expect(getCollector("feed-items")?.id).toBe("feed-items");
    expect(getCollector("feed-items", new Set(["feed-items"]))).toBeUndefined();
    expect(getCollector("nope")).toBeUndefined();
  });
});
