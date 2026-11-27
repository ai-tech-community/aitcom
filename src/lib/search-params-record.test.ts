import { describe, expect, it } from "vitest";
import { searchParamsFromRecord } from "./search-params-record";

describe("searchParamsFromRecord", () => {
  it("keeps every param a page received, repeated ones in order", () => {
    expect(
      searchParamsFromRecord({
        tab: "profile",
        ref: ["mail", "digest"],
        empty: "",
      }).toString(),
    ).toBe("tab=profile&ref=mail&ref=digest&empty=");
  });

  it("skips params that are not there", () => {
    expect(searchParamsFromRecord({ tab: undefined }).toString()).toBe("");
    expect(searchParamsFromRecord({}).toString()).toBe("");
  });
});
