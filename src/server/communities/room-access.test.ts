import { describe, expect, it } from "vitest";

import {
  canJoinDirectly,
  isActiveMember,
  roomSlugFromName,
} from "./room-access";

describe("canJoinDirectly", () => {
  it("is true only for public rooms", () => {
    expect(canJoinDirectly("public")).toBe(true);
    expect(canJoinDirectly("private")).toBe(false);
    expect(canJoinDirectly(null)).toBe(false);
  });
});

describe("isActiveMember", () => {
  it("is true only for an active membership row", () => {
    expect(isActiveMember({ status: "active" })).toBe(true);
    expect(isActiveMember({ status: "pending_request" })).toBe(false);
    expect(isActiveMember(null)).toBe(false);
    expect(isActiveMember(undefined)).toBe(false);
  });
});

describe("roomSlugFromName", () => {
  it("slugifies and appends a short suffix for uniqueness", () => {
    const slug = roomSlugFromName("Cohort 12!", "abc123");
    expect(slug).toBe("cohort-12-abc123");
  });
  it("handles empty/odd names", () => {
    expect(roomSlugFromName("   ", "zz99")).toBe("room-zz99");
  });
});
