import { describe, expect, it } from "vitest";
import { roomAccessRequestRecipients } from "./room-notifications";

describe("roomAccessRequestRecipients", () => {
  it("dedupes admin ids preserving first-seen order", () => {
    expect(roomAccessRequestRecipients(["a", "a", "b"], "z")).toEqual([
      "a",
      "b",
    ]);
  });

  it("excludes the requester", () => {
    expect(roomAccessRequestRecipients(["a", "b"], "a")).toEqual(["b"]);
  });

  it("returns empty when there are no admins", () => {
    expect(roomAccessRequestRecipients([], "z")).toEqual([]);
  });
});
