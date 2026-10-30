import { describe, expect, it } from "vitest";

import {
  collectionDeletionMode,
  deletionMode,
  softDeleteData,
} from "./deletion-mode";

describe("magazine deletion mode", () => {
  it("soft-deletes when the schema already has a deleted flag", () => {
    expect(deletionMode(["title", "deletedAt"])).toBe("soft");
    expect(deletionMode(["isDeleted"])).toBe("soft");
    expect(softDeleteData(["deletedAt"], "2026-10-29T00:00:00.000Z")).toEqual({
      deletedAt: "2026-10-29T00:00:00.000Z",
    });
    expect(softDeleteData(["isDeleted"], "2026-10-29T00:00:00.000Z")).toEqual({
      isDeleted: true,
    });
  });

  it("hard-deletes articles and issues, which have no deleted flag", () => {
    expect(collectionDeletionMode("articles")).toBe("hard");
    expect(collectionDeletionMode("magazine-issues")).toBe("hard");
    expect(deletionMode(["title", "status"])).toBe("hard");
  });
});
