import { describe, expect, it } from "vitest";

import { isMediaPurpose, isUploadRoutePurpose } from "./image-uploads";

describe("upload purposes", () => {
  it("knows feed post images and profile photos", () => {
    expect(isMediaPurpose("feed-post")).toBe(true);
    expect(isMediaPurpose("avatar")).toBe(true);
    expect(isMediaPurpose("cover")).toBe(false);
  });

  it("lets the general upload route record feed post images only", () => {
    expect(isUploadRoutePurpose("feed-post")).toBe(true);
    // A profile photo is uploaded and set in one step by its own route.
    expect(isUploadRoutePurpose("avatar")).toBe(false);
    expect(isUploadRoutePurpose(null)).toBe(false);
  });
});
