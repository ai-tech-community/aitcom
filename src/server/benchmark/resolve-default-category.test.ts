import { describe, expect, it } from "vitest";
import { resolveDefaultCategory } from "./resolve-default-category";

const cats = [
  { id: "c1", slug: "saas", name: "SaaS" },
  { id: "c2", slug: "ai-tools", name: "AI Tools" },
  { id: "c3", slug: "devtools", name: "DevTools" },
];

describe("resolveDefaultCategory", () => {
  it("picks the highest-sharePct category when hero rows exist", () => {
    const heroRows = [
      { categoryId: "c1", sharePct: 12.5 },
      { categoryId: "c2", sharePct: 40.0 },
      { categoryId: "c3", sharePct: 25.0 },
    ];
    expect(resolveDefaultCategory(cats, heroRows)?.slug).toBe("ai-tools");
  });

  it("falls back to alphabetically-first slug when no hero rows", () => {
    expect(resolveDefaultCategory(cats, [])?.slug).toBe("ai-tools");
  });

  it("returns null when no categories", () => {
    expect(resolveDefaultCategory([], [])).toBeNull();
  });

  it("ignores hero rows for categories not present in the list", () => {
    const heroRows = [
      { categoryId: "missing", sharePct: 99.0 },
      { categoryId: "c1", sharePct: 10.0 },
    ];
    expect(resolveDefaultCategory(cats, heroRows)?.slug).toBe("saas");
  });
});
