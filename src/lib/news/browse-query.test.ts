import { expect, it } from "vitest";

import { matchesNewsBrowseQuery, newsBrowseQuery } from "./browse-query";

it("uses query, and q when query is blank", () => {
  expect(newsBrowseQuery({ query: "  Local AI  ", q: "other" })).toBe(
    "Local AI",
  );
  expect(newsBrowseQuery({ query: "  ", q: " models " })).toBe("models");
  expect(newsBrowseQuery({})).toBe("");
});

it("matches a title, topic, or slug and keeps every row when the query is empty", () => {
  const fields = ["Local AI", "local-ai", null];
  expect(matchesNewsBrowseQuery(fields, "")).toBe(true);
  expect(matchesNewsBrowseQuery(fields, "LOCAL")).toBe(true);
  expect(matchesNewsBrowseQuery(fields, "match day")).toBe(false);
});
