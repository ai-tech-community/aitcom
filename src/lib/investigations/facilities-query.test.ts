import { describe, expect, it } from "vitest";

import {
  clearFiltersPatch,
  defaultSortDir,
  hasActiveFacilityFilters,
  paginationRange,
  patchSearchParams,
  sortPatch,
} from "./facilities-query";

describe("patchSearchParams", () => {
  it("sets, replaces and removes keys, treating empty values as removal", () => {
    expect(
      patchSearchParams("status=operational&q=abc", {
        status: "announced",
        q: "",
        country: "NL",
      }),
    ).toBe("status=announced&country=NL");
  });

  it("returns to the first page when anything but the page changes", () => {
    expect(patchSearchParams("page=4&status=operational", { ai: "1" })).toBe(
      "status=operational&ai=1",
    );
  });

  it("keeps the page when the page itself is the change", () => {
    expect(patchSearchParams("page=4&ai=1", { page: "5" })).toBe("page=5&ai=1");
    expect(patchSearchParams("page=4&ai=1", { page: null })).toBe("ai=1");
  });
});

describe("sortPatch", () => {
  it("starts a new column at its natural direction", () => {
    expect(defaultSortDir("capacity")).toBe("desc");
    expect(defaultSortDir("name")).toBe("asc");
    expect(sortPatch({ sort: "capacity", dir: "desc" }, "name")).toEqual({
      sort: "name",
      dir: "asc",
    });
  });

  it("toggles the direction of the active column", () => {
    expect(sortPatch({ sort: "name", dir: "asc" }, "name")).toEqual({
      sort: "name",
      dir: "desc",
    });
  });

  it("drops the params when the result is the default sort, keeping URLs canonical", () => {
    expect(sortPatch({ sort: "capacity", dir: "asc" }, "capacity")).toEqual({
      sort: null,
      dir: null,
    });
    expect(
      patchSearchParams(
        "sort=capacity&dir=asc&page=3",
        sortPatch({ sort: "capacity", dir: "asc" }, "capacity"),
      ),
    ).toBe("");
  });
});

describe("filters", () => {
  it("detects filters but ignores sort, paging and blank values", () => {
    expect(hasActiveFacilityFilters("sort=name&page=2&size=50&q=")).toBe(false);
    expect(hasActiveFacilityFilters("operator=microsoft")).toBe(true);
    expect(hasActiveFacilityFilters("unverified=1")).toBe(true);
  });

  it("clears every filter while keeping sort and page size", () => {
    expect(
      patchSearchParams(
        "q=x&status=announced&country=US&power=gas&operator=a&supplier=b&ai=1&suppliers=1&unverified=1&sort=name&size=50&page=2",
        clearFiltersPatch(),
      ),
    ).toBe("sort=name&size=50");
  });
});

describe("paginationRange", () => {
  it("lists every page when there are few", () => {
    expect(paginationRange(1, 1)).toEqual([1]);
    expect(paginationRange(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("collapses distant pages into gaps around the current page", () => {
    expect(paginationRange(1, 16)).toEqual([1, 2, "gap", 16]);
    expect(paginationRange(8, 16)).toEqual([1, "gap", 7, 8, 9, "gap", 16]);
    expect(paginationRange(16, 16)).toEqual([1, "gap", 15, 16]);
  });

  it("shows a single skipped page instead of a gap", () => {
    expect(paginationRange(4, 16)).toEqual([1, 2, 3, 4, 5, "gap", 16]);
  });

  it("is empty when there are no pages", () => {
    expect(paginationRange(1, 0)).toEqual([]);
  });
});
