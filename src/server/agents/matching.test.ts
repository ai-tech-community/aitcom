import { describe, expect, it } from "vitest";
import { pairKey, scoreIntroductions, type MemberProfile } from "./matching";

const m = (userId: string, interests: string[], skills: string[] = []): MemberProfile => ({
  userId,
  interests,
  skills,
});

describe("pairKey", () => {
  it("is order-independent", () => {
    expect(pairKey("b", "a")).toBe(pairKey("a", "b"));
    expect(pairKey("a", "b")).toBe("a|b");
  });
});

describe("scoreIntroductions", () => {
  it("pairs members by shared interests/skills, ranked by overlap", () => {
    const res = scoreIntroductions({
      members: [
        m("u1", ["ai", "rust"]),
        m("u2", ["ai", "rust"]), // 2 shared with u1
        m("u3", ["ai"], ["go"]), // 1 shared with u1/u2
      ],
    });
    expect(res[0]).toMatchObject({ userIdA: "u1", userIdB: "u2" });
    expect(res[0]!.sharedInterests).toEqual(["ai", "rust"]);
    expect(res[0]!.score).toBeGreaterThan(res[res.length - 1]!.score);
  });

  it("excludes pairs with zero overlap", () => {
    const res = scoreIntroductions({
      members: [m("u1", ["ai"]), m("u2", ["cooking"])],
    });
    expect(res).toEqual([]);
  });

  it("excludes already-connected/suggested pairs via excludePairs", () => {
    const res = scoreIntroductions({
      members: [m("u1", ["ai"]), m("u2", ["ai"])],
      excludePairs: new Set([pairKey("u1", "u2")]),
    });
    expect(res).toEqual([]);
  });

  it("counts shared skills too and respects the cap", () => {
    const res = scoreIntroductions({
      members: [
        m("u1", [], ["rust", "go"]),
        m("u2", [], ["rust", "go"]),
        m("u3", [], ["rust"]),
      ],
      cap: 1,
    });
    expect(res.length).toBe(1);
    expect(res[0]!.sharedSkills).toEqual(["rust", "go"]);
  });

  it("is deterministic: ties broken by userId", () => {
    const res = scoreIntroductions({
      members: [m("ub", ["x"]), m("ua", ["x"]), m("uc", ["x"])],
    });
    // all pairs share 1 interest; first pair is the lexicographically smallest
    expect(res[0]).toMatchObject({ userIdA: "ua", userIdB: "ub" });
  });
});
