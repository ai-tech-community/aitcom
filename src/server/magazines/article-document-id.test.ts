import { describe, expect, it } from "vitest";

import { articleDocumentId, articleIdForTool } from "./article-document-id";

const SLUG = "town-notes";
const VERSION_UUID = "ba8af6e7-1111-4111-8111-111111111111";

describe("article document id", () => {
  it("accepts the integer primary key and rejects a version uuid", () => {
    expect(articleDocumentId(50)).toBe(50);
    expect(articleDocumentId("50")).toBe(50);
    expect(articleDocumentId(VERSION_UUID)).toBeNull();
    expect(articleDocumentId(0)).toBeNull();
  });

  it("returns the same id when a later read reports the version uuid", () => {
    const main = new Map([[SLUG, 50]]);
    expect(articleIdForTool({ id: 50, slug: SLUG }, main)).toBe(50);
    expect(articleIdForTool({ id: VERSION_UUID, slug: SLUG }, main)).toBe(50);
    expect(articleIdForTool({ id: 12, slug: SLUG }, main)).toBe(50);
  });
});
