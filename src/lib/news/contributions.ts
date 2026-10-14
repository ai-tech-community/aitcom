export const CLAIM_POINTS = 10;
export const PUBLISHED_POINTS = 50;
export const BREAKING_BONUS = 25;
export const DAILY_TOPIC_GOAL = 5;
export const REGION_EXPERT_STORIES = 3;
export const FIVE_STORY_BADGE = 5;
export const CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;
const BREAKING_WINDOW_MS = CLAIM_WINDOW_MS;

export type NewsRegion = "eu" | "il" | "asia";

export type NewsContributionBadge =
  | "news_first_scoop"
  | "news_five_stories"
  | "news_region_eu"
  | "news_region_il"
  | "news_region_asia";

const EU = [
  "eu",
  "europe",
  "european",
  "brussels",
  "netherlands",
  "dutch",
  "amsterdam",
  "germany",
  "german",
  "france",
  "french",
  "spain",
  "spanish",
  "italy",
  "italian",
  "sweden",
  "swedish",
  "poland",
  "ireland",
  "irish",
  "belgium",
  "belgian",
  "portugal",
  "austria",
  "finland",
  "finnish",
  "denmark",
  "danish",
];
const IL = ["israel", "israeli", "tel aviv", "jerusalem", "haifa"];
const ASIA = [
  "asia",
  "asian",
  "china",
  "chinese",
  "japan",
  "japanese",
  "korea",
  "korean",
  "singapore",
  "india",
  "indian",
  "taiwan",
  "taiwanese",
  "indonesia",
  "vietnam",
  "thailand",
  "hong kong",
  "seoul",
  "tokyo",
  "beijing",
  "shanghai",
  "bengaluru",
  "bangalore",
];

function hits(text: string, phrases: readonly string[]): number {
  return phrases.reduce((count, phrase) => {
    const pattern = new RegExp(
      `\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    );
    return count + (pattern.test(text) ? 1 : 0);
  }, 0);
}

/** A region only when the headlines name one place more than the others. */
export function storyRegion(titles: readonly string[]): NewsRegion | null {
  const text = titles.join("\n");
  const scores: Record<NewsRegion, number> = {
    eu: hits(text, EU),
    il: hits(text, IL),
    asia: hits(text, ASIA),
  };
  const ranked = (Object.entries(scores) as [NewsRegion, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0]![1] === ranked[1]![1]) return null;
  return ranked[0]![0];
}

export function isBreakingTopic(newestAt: Date, now: Date): boolean {
  const age = now.getTime() - newestAt.getTime();
  return age >= 0 && age <= BREAKING_WINDOW_MS;
}

export function claimExpiry(now: Date): Date {
  return new Date(now.getTime() + CLAIM_WINDOW_MS);
}

/** Monday 00:00 UTC of the week that contains `now`, matching the digest. */
export function contributionWeekStart(now: Date): Date {
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = monday.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  monday.setUTCDate(monday.getUTCDate() + offset);
  return monday;
}

export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function topicsCoveredToday(
  suggestedKeys: readonly string[],
  claimedKeys: readonly string[],
): { covered: number; total: number; visible: boolean } {
  if (suggestedKeys.length === 0) {
    return { covered: 0, total: DAILY_TOPIC_GOAL, visible: false };
  }
  const suggested = new Set(suggestedKeys);
  const covered = new Set(claimedKeys.filter((key) => suggested.has(key)));
  return {
    covered: Math.min(DAILY_TOPIC_GOAL, covered.size),
    total: DAILY_TOPIC_GOAL,
    visible: true,
  };
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return utcDayKey(date);
}

/** Consecutive UTC days with a claim or a published story. */
export function contributionStreak(
  dayKeys: readonly string[],
  today: string,
): { current: number; longest: number } {
  const days = [...new Set(dayKeys)].sort();
  if (days.length === 0) return { current: 0, longest: 0 };
  let longest = 1;
  let run = 1;
  for (let index = 1; index < days.length; index += 1) {
    if (shiftDay(days[index - 1]!, 1) === days[index]) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }
  const held = new Set(days);
  let cursor = held.has(today) ? today : shiftDay(today, -1);
  let current = 0;
  while (held.has(cursor)) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }
  return { current, longest };
}

export function publishedContributionBadges(input: {
  publishedCount: number;
  region: NewsRegion | null;
  regionCount: number;
}): NewsContributionBadge[] {
  const badges: NewsContributionBadge[] = [];
  if (input.publishedCount >= FIVE_STORY_BADGE)
    badges.push("news_five_stories");
  if (input.region && input.regionCount >= REGION_EXPERT_STORIES) {
    badges.push(`news_region_${input.region}`);
  }
  return badges;
}

export type ClaimWrite = {
  insertClaim(row: {
    userId: string;
    topicKey: string;
    title: string;
    points: number;
    expiresAt: Date;
  }): Promise<"inserted" | "exists">;
  insertBreaking(row: {
    userId: string;
    topicKey: string;
    title: string;
    points: number;
  }): Promise<"inserted" | "exists">;
  existingClaim(
    userId: string,
    topicKey: string,
  ): Promise<{ expiresAt: Date } | null>;
};

export async function applyStoryClaim(
  store: ClaimWrite,
  args: {
    userId: string;
    topicKey: string;
    title: string;
    now: Date;
    breaking: boolean;
  },
): Promise<{
  alreadyClaimed: boolean;
  pointsAwarded: number;
  expiresAt: Date;
  firstScoop: boolean;
}> {
  const expiresAt = claimExpiry(args.now);
  const inserted = await store.insertClaim({
    userId: args.userId,
    topicKey: args.topicKey,
    title: args.title,
    points: CLAIM_POINTS,
    expiresAt,
  });
  if (inserted === "exists") {
    const existing = await store.existingClaim(args.userId, args.topicKey);
    return {
      alreadyClaimed: true,
      pointsAwarded: 0,
      expiresAt: existing?.expiresAt ?? expiresAt,
      firstScoop: false,
    };
  }
  if (!args.breaking) {
    return {
      alreadyClaimed: false,
      pointsAwarded: CLAIM_POINTS,
      expiresAt,
      firstScoop: false,
    };
  }
  const breaking = await store.insertBreaking({
    userId: args.userId,
    topicKey: args.topicKey,
    title: args.title,
    points: BREAKING_BONUS,
  });
  const firstScoop = breaking === "inserted";
  return {
    alreadyClaimed: false,
    pointsAwarded: CLAIM_POINTS + (firstScoop ? BREAKING_BONUS : 0),
    expiresAt,
    firstScoop,
  };
}
