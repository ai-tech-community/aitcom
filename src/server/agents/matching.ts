// src/server/agents/matching.ts

export type MemberProfile = {
  userId: string;
  interests: string[];
  skills: string[];
};

export type IntroCandidate = {
  userIdA: string; // always the lexicographically smaller id
  userIdB: string;
  sharedInterests: string[];
  sharedSkills: string[];
  score: number;
};

/** Order-independent key for an unordered member pair. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function overlap(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((x) => set.has(x));
}

/** Rank candidate introductions by shared interests (weighted ×2) + shared
 *  skills. Excludes zero-overlap pairs, self-pairs, and excluded pairs.
 *  Deterministic: sorted by score desc, then userIdA, then userIdB. */
export function scoreIntroductions(opts: {
  members: MemberProfile[];
  excludePairs?: Set<string>;
  cap?: number;
}): IntroCandidate[] {
  const { members, excludePairs, cap } = opts;
  const out: IntroCandidate[] = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const m1 = members[i]!;
      const m2 = members[j]!;
      const [a, b] = m1.userId < m2.userId ? [m1, m2] : [m2, m1];
      if (excludePairs?.has(pairKey(a.userId, b.userId))) continue;
      const sharedInterests = overlap(a.interests, b.interests);
      const sharedSkills = overlap(a.skills, b.skills);
      const score = sharedInterests.length * 2 + sharedSkills.length;
      if (score === 0) continue;
      out.push({
        userIdA: a.userId,
        userIdB: b.userId,
        sharedInterests,
        sharedSkills,
        score,
      });
    }
  }
  out.sort(
    (x, y) =>
      y.score - x.score ||
      x.userIdA.localeCompare(y.userIdA) ||
      x.userIdB.localeCompare(y.userIdB),
  );
  return cap != null ? out.slice(0, cap) : out;
}
