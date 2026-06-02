import { describe, it, expect } from "vitest";
import {
  selectStackFaces,
  shouldRenderStack,
  overflowCount,
  MEMBER_STACK_MAX_FACES,
  MEMBER_STACK_MIN_TOTAL,
  type StackCandidate,
} from "./member-stack";

function candidate(over: Partial<StackCandidate>): StackCandidate {
  return {
    userId: "u",
    role: "member",
    displayName: "Name",
    image: null,
    isPublic: true,
    joinedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

describe("selectStackFaces", () => {
  it("orders leadership-first, then earliest joined", () => {
    const faces = selectStackFaces([
      candidate({ userId: "m", role: "member", joinedAt: new Date("2026-01-01") }),
      candidate({ userId: "owner", role: "owner", joinedAt: new Date("2026-03-01") }),
      candidate({ userId: "mod", role: "moderator", joinedAt: new Date("2026-02-01") }),
      candidate({ userId: "admin-late", role: "admin", joinedAt: new Date("2026-04-01") }),
      candidate({ userId: "admin-early", role: "admin", joinedAt: new Date("2026-01-15") }),
    ]);
    expect(faces.map((f) => f.userId)).toEqual([
      "owner",
      "admin-early",
      "admin-late",
      "mod",
    ]);
  });

  it("excludes private profiles from faces", () => {
    const faces = selectStackFaces([
      candidate({ userId: "pub", isPublic: true }),
      candidate({ userId: "priv", role: "owner", isPublic: false }),
    ]);
    expect(faces.map((f) => f.userId)).toEqual(["pub"]);
  });

  it("caps at MEMBER_STACK_MAX_FACES", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      candidate({ userId: `u${i}` }),
    );
    expect(selectStackFaces(many)).toHaveLength(MEMBER_STACK_MAX_FACES);
  });

  it("maps to bare face shape", () => {
    const [face] = selectStackFaces([
      candidate({ userId: "u1", displayName: "Ada", image: "x.png" }),
    ]);
    expect(face).toEqual({ userId: "u1", displayName: "Ada", image: "x.png" });
  });
});

describe("shouldRenderStack", () => {
  it("is false below the minimum total", () => {
    expect(shouldRenderStack(MEMBER_STACK_MIN_TOTAL - 1)).toBe(false);
  });
  it("is true at the minimum total", () => {
    expect(shouldRenderStack(MEMBER_STACK_MIN_TOTAL)).toBe(true);
  });
});

describe("overflowCount", () => {
  it("returns total minus shown faces", () => {
    expect(overflowCount(398, 4)).toBe(394);
  });
  it("never goes negative", () => {
    expect(overflowCount(3, 4)).toBe(0);
  });
});
