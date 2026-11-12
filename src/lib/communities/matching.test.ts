import { describe, expect, it } from "vitest";
import {
  cleanMatchingAnswers,
  connectionTypeInput,
  emptyMatchingProfile,
  findCommunityMatches,
  type ConnectionType,
  type MatchingMember,
} from "./matching";

const shared: ConnectionType = {
  id: "hobbies",
  active: true,
  name: "Hobbies",
  description: "",
  mode: "shared",
  promptA: "What do you enjoy?",
  promptB: "",
  topics: ["Cycling", "Hiking"],
};
const business: ConnectionType = {
  ...shared,
  id: "business",
  mode: "complementary",
  topics: ["Sales", "Design"],
  promptB: "What do you need?",
};
function member(
  userId: string,
  patch: Partial<MatchingMember> = {},
): MatchingMember {
  return {
    ...emptyMatchingProfile,
    userId,
    displayName: userId,
    image: null,
    optedIn: true,
    answers: { hobbies: { interests: ["Cycling"], offering: [], seeking: [] } },
    ...patch,
  };
}
const match = (members: MatchingMember[], types = [shared]) =>
  findCommunityMatches({ members, types });

describe("community matching", () => {
  it("matches normalized shared topics once, with canonical labels", () => {
    const result = match([
      member("b"),
      member("a", {
        answers: {
          hobbies: {
            interests: ["  CYCLING ", "cycling"],
            offering: [],
            seeking: [],
          },
        },
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      userIdA: "a",
      userIdB: "b",
      reasons: [{ topic: "Cycling", kind: "shared" }],
      score: 10,
    });
  });
  it("matches offers to needs with the right direction, not two offers", () => {
    const a = member("a", {
      answers: {
        business: { interests: [], offering: ["Sales"], seeking: [] },
      },
    });
    const b = member("b", {
      answers: {
        business: { interests: [], offering: [], seeking: ["sales"] },
      },
    });
    expect(match([b, a], [business])[0]?.reasons[0]).toMatchObject({
      offeringUserId: "a",
      seekingUserId: "b",
      topic: "Sales",
    });
    expect(match([a, { ...b, answers: a.answers }], [business])).toEqual([]);
  });
  it("does not invent a match from location or languages alone", () => {
    expect(
      match([
        member("a", { answers: {}, city: "Amsterdam", languages: ["English"] }),
        member("b", { city: "Amsterdam", languages: ["English"] }),
      ]),
    ).toEqual([]);
  });
  it("strengthens an actual match with city and language, below an additional substantive reason", () => {
    const result = match([
      member("a", { city: "Amsterdam", languages: ["English", "English"] }),
      member("b", { city: " amsterdam ", languages: ["english"] }),
    ]);
    expect(result[0]).toMatchObject({
      score: 13,
      sameCity: "Amsterdam",
      languages: ["English"],
    });
  });
  it("excludes opted-out, self, incompatible and excluded pairs", () => {
    expect(match([member("a"), member("b", { optedIn: false })])).toEqual([]);
    expect(match([member("a"), member("a")])).toEqual([]);
    expect(
      match([
        member("a", { meeting: "online" }),
        member("b", { meeting: "in_person" }),
      ]),
    ).toEqual([]);
    expect(
      findCommunityMatches({
        members: [member("a"), member("b")],
        types: [shared],
        excludePairs: new Set(["a|b"]),
      }),
    ).toEqual([]);
  });
  it("ignores archived types and removed topics", () => {
    expect(
      match([member("a"), member("b")], [{ ...shared, active: false }]),
    ).toEqual([]);
    expect(
      match([member("a"), member("b")], [{ ...shared, topics: ["Hiking"] }]),
    ).toEqual([]);
    expect(
      cleanMatchingAnswers(
        { unknown: { interests: ["Cycling"], offering: [], seeking: [] } },
        [shared],
      ),
    ).toEqual({});
  });
  it("applies member/type filters before the result limit and ranks deterministically", () => {
    const members = [member("c"), member("b"), member("a")];
    expect(
      findCommunityMatches({
        members,
        types: [shared],
        memberId: "c",
        limit: 1,
      })[0]?.pairKey,
    ).toBe("a|c");
    expect(
      findCommunityMatches({ members, types: [shared], typeId: "business" }),
    ).toEqual([]);
    expect(match(members)).toEqual(match([...members].reverse()));
  });
  it("requires complementary questions and nonempty owner topics", () => {
    expect(
      connectionTypeInput.safeParse({ ...business, promptB: "" }).success,
    ).toBe(false);
    expect(
      connectionTypeInput.safeParse({ ...shared, topics: [] }).success,
    ).toBe(false);
  });
});
