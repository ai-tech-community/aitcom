import { describe, it, expect } from "vitest";
import {
  selectStackFaces,
  shouldRenderStack,
  presentStack,
  MEMBER_STACK_MAX_FACES,
  MEMBER_STACK_FACES_WITH_OVERFLOW,
  MEMBER_STACK_MIN_TOTAL,
  type StackCandidate,
  type StackFace,
} from "./member-stack";

function face(userId: string): StackFace {
  return { userId, displayName: userId, image: null };
}

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
      candidate({
        userId: "m",
        role: "member",
        joinedAt: new Date("2026-01-01"),
      }),
      candidate({
        userId: "owner",
        role: "owner",
        joinedAt: new Date("2026-03-01"),
      }),
      candidate({
        userId: "mod",
        role: "moderator",
        joinedAt: new Date("2026-02-01"),
      }),
      candidate({
        userId: "admin-late",
        role: "admin",
        joinedAt: new Date("2026-04-01"),
      }),
      candidate({
        userId: "admin-early",
        role: "admin",
        joinedAt: new Date("2026-01-15"),
      }),
    ]);
    expect(faces.map((f) => f.userId)).toEqual([
      "owner",
      "admin-early",
      "admin-late",
      "mod",
      "m",
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

describe("presentStack", () => {
  it("shows all faces and no overflow at or below the max-faces total", () => {
    const faces = [face("a"), face("b"), face("c")];
    const { shownFaces, overflow } = presentStack(faces, 3);
    expect(shownFaces.map((f) => f.userId)).toEqual(["a", "b", "c"]);
    expect(overflow).toBe(0);
  });

  it("shows up to MEMBER_STACK_MAX_FACES with no overflow at exactly the max", () => {
    const faces = Array.from({ length: 5 }, (_, i) => face(`u${i}`));
    const { shownFaces, overflow } = presentStack(
      faces,
      MEMBER_STACK_MAX_FACES,
    );
    expect(shownFaces).toHaveLength(MEMBER_STACK_MAX_FACES);
    expect(overflow).toBe(0);
  });

  it("turns the last circle into '+N' once the total exceeds the max", () => {
    const faces = Array.from({ length: 5 }, (_, i) => face(`u${i}`));
    const { shownFaces, overflow } = presentStack(faces, 10);
    expect(shownFaces).toHaveLength(MEMBER_STACK_FACES_WITH_OVERFLOW);
    expect(overflow).toBe(10 - MEMBER_STACK_FACES_WITH_OVERFLOW); // 6
  });

  it("counts private members in the overflow (fewer public faces than slots)", () => {
    // Only 2 public faces, but 10 active members total.
    const { shownFaces, overflow } = presentStack([face("a"), face("b")], 10);
    expect(shownFaces.map((f) => f.userId)).toEqual(["a", "b"]);
    expect(overflow).toBe(8); // 10 total - 2 shown
  });
});
