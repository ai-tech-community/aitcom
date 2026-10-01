import { describe, expect, it } from "vitest";

import { ownsStorageContents } from "./storage-ownership";

describe("ownsStorageContents", () => {
  it("is true only for the production deployment", () => {
    expect(ownsStorageContents("production")).toBe(true);
    for (const env of ["preview", "development", undefined, ""]) {
      expect(ownsStorageContents(env)).toBe(false);
    }
  });
});
