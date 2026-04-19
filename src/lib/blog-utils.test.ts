import { describe, expect, it } from "vitest";
import { buildBlogUrl } from "./blog-utils";

describe("buildBlogUrl", () => {
  it("returns /blog with no params", () => {
    expect(buildBlogUrl({})).toBe("/blog");
  });

  it("includes q param", () => {
    expect(buildBlogUrl({ q: "react" })).toBe("/blog?q=react");
  });

  it("includes tag param", () => {
    expect(buildBlogUrl({ tag: "ai" })).toBe("/blog?tag=ai");
  });

  it("includes page param", () => {
    expect(buildBlogUrl({ page: 2 })).toBe("/blog?page=2");
  });

  it("composes all params", () => {
    expect(buildBlogUrl({ q: "react", tag: "ai", page: 3 })).toBe(
      "/blog?q=react&tag=ai&page=3",
    );
  });

  it("omits empty q", () => {
    expect(buildBlogUrl({ q: "", tag: "ai" })).toBe("/blog?tag=ai");
  });

  it("omits whitespace-only q", () => {
    expect(buildBlogUrl({ q: "   ", tag: "ai" })).toBe("/blog?tag=ai");
  });

  it("omits page 1", () => {
    expect(buildBlogUrl({ page: 1 })).toBe("/blog");
  });

  it("omits undefined values", () => {
    expect(
      buildBlogUrl({ q: undefined, tag: undefined, page: undefined }),
    ).toBe("/blog");
  });
});
