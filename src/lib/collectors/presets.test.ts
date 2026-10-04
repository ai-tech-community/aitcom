import { describe, expect, it } from "vitest";

import {
  CUSTOM_PAGE_PRESET_ID,
  PRESET_GROUPS,
  formerStartIds,
  presetIdForFormerId,
} from "./presets";

describe("preset groups", () => {
  it("puts the Custom page group last", () => {
    expect(PRESET_GROUPS.at(-1)).toBe("custom");
  });
});

describe("former start ids", () => {
  it("reads only its own entries as former ids", () => {
    expect(presetIdForFormerId("feed-items")).toBe("feed");
    expect(presetIdForFormerId("page-list")).toBe(CUSTOM_PAGE_PRESET_ID);
    expect(presetIdForFormerId("feed")).toBeNull();
    expect(presetIdForFormerId("constructor")).toBeNull();
    expect(presetIdForFormerId("__proto__")).toBeNull();
    expect(presetIdForFormerId("toString")).toBeNull();
  });

  it("cannot be changed at run time", () => {
    expect(Object.isFrozen(formerStartIds())).toBe(true);
  });
});
