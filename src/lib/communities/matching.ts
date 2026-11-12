import { z } from "zod";

export const normalizeTopic = (value: string) =>
  value.trim().replace(/\s+/g, " ").normalize("NFKC").toLowerCase();

const topic = z.string().trim().min(1).max(80);
const topics = z.array(topic).max(30);
export const connectionTypeInput = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500),
    mode: z.enum(["shared", "complementary"]),
    promptA: z.string().trim().min(1).max(160),
    promptB: z.string().trim().max(160),
    topics: topics
      .min(1)
      .transform((values) => [
        ...new Map(values.map((v) => [normalizeTopic(v), v])).values(),
      ]),
  })
  .refine((v) => v.mode !== "complementary" || v.promptB.length > 0, {
    path: ["promptB"],
    message: "A second question is required",
  });

export const matchingProfileInput = z.object({
  optedIn: z.boolean(),
  city: z.string().trim().max(100),
  languages: z.array(z.string().trim().min(1).max(40)).max(10),
  meeting: z.enum(["either", "online", "in_person"]),
  answers: z
    .record(
      z.string().min(1).max(255),
      z.object({
        interests: topics,
        offering: topics,
        seeking: topics,
      }),
    )
    .refine((v) => Object.keys(v).length <= 20),
});

export type MatchingProfile = z.infer<typeof matchingProfileInput>;
export type ConnectionType = z.infer<typeof connectionTypeInput> & {
  id: string;
  active: boolean;
};
export type MatchingMember = MatchingProfile & {
  userId: string;
  displayName: string;
  image: string | null;
};
export type MatchReason = {
  typeId: string;
  topic: string;
  kind: "shared" | "complementary";
  offeringUserId?: string;
  seekingUserId?: string;
};
export type CommunityMatch = {
  userIdA: string;
  userIdB: string;
  pairKey: string;
  reasons: MatchReason[];
  sameCity: string | null;
  languages: string[];
  score: number;
};

export const emptyMatchingProfile: MatchingProfile = {
  optedIn: false,
  city: "",
  languages: [],
  meeting: "either",
  answers: {},
};

export function matchingPairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Owner options define the vocabulary. Archived/removed answers never match. */
export function cleanMatchingAnswers(
  answers: MatchingProfile["answers"],
  types: ConnectionType[],
): MatchingProfile["answers"] {
  const result: MatchingProfile["answers"] = {};
  for (const type of types.filter((t) => t.active)) {
    const answer = answers[type.id];
    if (!answer) continue;
    const allowed = new Map(type.topics.map((t) => [normalizeTopic(t), t]));
    const clean = (values: string[]) =>
      [...new Set(values.map(normalizeTopic))].flatMap((v) =>
        allowed.has(v) ? [allowed.get(v)!] : [],
      );
    result[type.id] = {
      interests: type.mode === "shared" ? clean(answer.interests) : [],
      offering: type.mode === "complementary" ? clean(answer.offering) : [],
      seeking: type.mode === "complementary" ? clean(answer.seeking) : [],
    };
  }
  return result;
}

function overlap(a: string[], b: string[]) {
  const values = new Set(b.map(normalizeTopic));
  return [...new Map(a.map((v) => [normalizeTopic(v), v])).entries()]
    .filter(([key]) => values.has(key))
    .map(([, value]) => value);
}

/** Explicit answers only. Context can strengthen but cannot invent a match. */
export function findCommunityMatches(input: {
  members: MatchingMember[];
  types: ConnectionType[];
  excludePairs?: Set<string>;
  typeId?: string;
  memberId?: string;
  limit?: number;
}): CommunityMatch[] {
  const types = input.types.filter(
    (t) => t.active && (!input.typeId || t.id === input.typeId),
  );
  const members = [
    ...new Map(
      input.members
        .filter((m) => m.optedIn)
        .map((m) => [
          m.userId,
          { ...m, answers: cleanMatchingAnswers(m.answers, types) },
        ]),
    ).values(),
  ].sort((a, b) => a.userId.localeCompare(b.userId));
  const matches: CommunityMatch[] = [];
  const limit = Math.max(0, input.limit ?? 50);
  if (!limit) return [];
  const compare = (a: CommunityMatch, b: CommunityMatch) =>
    b.score - a.score || a.pairKey.localeCompare(b.pairKey);
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i]!;
      const b = members[j]!;
      if (
        input.memberId &&
        a.userId !== input.memberId &&
        b.userId !== input.memberId
      )
        continue;
      const pairKey = matchingPairKey(a.userId, b.userId);
      if (input.excludePairs?.has(pairKey)) continue;
      if (
        a.meeting !== "either" &&
        b.meeting !== "either" &&
        a.meeting !== b.meeting
      )
        continue;
      const reasons: MatchReason[] = [];
      for (const type of types) {
        const aa = a.answers[type.id];
        const bb = b.answers[type.id];
        if (!aa || !bb) continue;
        if (type.mode === "shared") {
          for (const topic of overlap(aa.interests, bb.interests))
            reasons.push({ typeId: type.id, topic, kind: "shared" });
        } else {
          for (const [offering, seeking, x, y] of [
            [aa.offering, bb.seeking, a, b],
            [bb.offering, aa.seeking, b, a],
          ] as const) {
            for (const topic of overlap(offering, seeking))
              reasons.push({
                typeId: type.id,
                topic,
                kind: "complementary",
                offeringUserId: x.userId,
                seekingUserId: y.userId,
              });
          }
        }
      }
      if (!reasons.length) continue;
      const sameCity =
        a.city && normalizeTopic(a.city) === normalizeTopic(b.city)
          ? a.city
          : null;
      const languages = overlap(a.languages, b.languages);
      const candidate: CommunityMatch = {
        userIdA: a.userId,
        userIdB: b.userId,
        pairKey,
        reasons,
        sameCity,
        languages,
        score:
          reasons.length * 10 +
          (sameCity ? 2 : 0) +
          Math.min(languages.length, 2),
      };
      // Keep only the strongest results rather than retaining every pair's
      // reasons (up to 124,750 pairs in the owner workspace's bounded pool).
      if (matches.length === limit && compare(candidate, matches.at(-1)!) >= 0)
        continue;
      let low = 0;
      let high = matches.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (compare(candidate, matches[mid]!) < 0) high = mid;
        else low = mid + 1;
      }
      matches.splice(low, 0, candidate);
      if (matches.length > limit) matches.pop();
    }
  }
  return matches;
}
