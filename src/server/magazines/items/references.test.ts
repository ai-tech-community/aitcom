import { describe, expect, it } from "vitest";

import { cutWords } from "./base-input";
import { validateReferences } from "./references";

describe("reference items", () => {
  it("refuses a new reference it may not accept, never a kept one", () => {
    expect(
      validateReferences(
        [
          { index: 0, stored: "missing-new", isNew: true },
          { index: 1, stored: "missing-kept", isNew: false },
          { index: 2, stored: "readable", isNew: true },
        ],
        {
          referenceOf: (id) => `storyline:${id}`,
          acceptNew: (id) => id === "readable",
        },
      ),
    ).toEqual([{ itemIndex: 0, code: "ITEM_INVALID" }]);
  });

  it("refuses the second copy of a reference, kept or new", () => {
    expect(
      validateReferences(
        [
          { index: 0, stored: "kept", isNew: false },
          { index: 1, stored: "kept", isNew: false },
          { index: 2, stored: "new", isNew: true },
          { index: 3, stored: "new", isNew: true },
          { index: 4, stored: "kept", isNew: true },
          { index: 5, stored: "rejected", isNew: true },
          { index: 6, stored: "rejected", isNew: true },
        ],
        {
          referenceOf: (id) => `storyline:${id}`,
          acceptNew: (id) => id !== "rejected",
        },
      ),
    ).toEqual([
      { itemIndex: 1, code: "ITEM_INVALID", detail: "duplicate" },
      { itemIndex: 3, code: "ITEM_INVALID", detail: "duplicate" },
      { itemIndex: 4, code: "ITEM_INVALID", detail: "duplicate" },
      { itemIndex: 5, code: "ITEM_INVALID" },
      { itemIndex: 6, code: "ITEM_INVALID", detail: "duplicate" },
    ]);
  });

  it("cutWords appends … only when it cuts", () => {
    expect(cutWords("  one two  ", 2)).toBe("one two");
    expect(cutWords("one two three", 2)).toBe("one two…");
    expect(cutWords("  one\n two\tthree ", 4)).toBe("one two three");
    expect(cutWords("   ", 2)).toBe("");
  });
});
