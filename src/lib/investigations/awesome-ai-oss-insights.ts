import {
  AWESOME_CATEGORY_IDS,
  AWESOME_CATEGORY_LABELS,
  type AwesomeCategoryId,
  type AwesomeLocale,
  type AwesomePublicCard,
  type AwesomeRepoHost,
} from "./awesome-ai-oss";
import { visibleAwesomeStarLine } from "./awesome-ai-oss-stars";

export const AWESOME_INSIGHTS_CAPTION =
  "from our curated list · refreshed daily";

export const AWESOME_INSIGHTS_STAR_BUCKETS = [
  { id: "1-99", min: 1, max: 99, label: "1–99" },
  { id: "100-999", min: 100, max: 999, label: "100–999" },
  { id: "1k-9999", min: 1_000, max: 9_999, label: "1k–9.9k" },
  { id: "10k+", min: 10_000, max: Number.POSITIVE_INFINITY, label: "10k+" },
] as const;

export type AwesomeInsightsCategoryRow = {
  id: AwesomeCategoryId;
  label: string;
  count: number;
};

export type AwesomeInsightsHostRow = {
  host: AwesomeRepoHost;
  label: "GitHub" | "GitLab";
  count: number;
};

export type AwesomeInsightsMonthRow = {
  month: string;
  label: string;
  count: number;
};

export type AwesomeInsightsStarBucketRow = {
  id: string;
  label: string;
  count: number;
};

export type AwesomeInsightsTopStarRow = {
  id: string;
  name: string;
  starCount: number;
  repoHost: AwesomeRepoHost;
};

export type AwesomeInsightsStats = {
  total: number;
  categoryMix: AwesomeInsightsCategoryRow[];
  hostMix: AwesomeInsightsHostRow[];
  addedOverTime: AwesomeInsightsMonthRow[];
  liveStarCount: number;
  starDistribution: AwesomeInsightsStarBucketRow[] | null;
  topLiveStars: AwesomeInsightsTopStarRow[] | null;
};

export function isAwesomeInsightsTab(
  value: string | string[] | undefined,
): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "insights";
}

export function liveAwesomeStarCards(
  cards: readonly AwesomePublicCard[],
  now: Date = new Date(),
): AwesomePublicCard[] {
  return cards.filter((card) => visibleAwesomeStarLine(card, now) != null);
}

export function formatInsightMonth(
  month: string,
  locale: AwesomeLocale,
): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Aggregates approved directory cards for Insights.
 * Uses fetched/listed fields only — never invents star counts or vote popularity.
 */
export function buildAwesomeInsights(
  cards: readonly AwesomePublicCard[],
  locale: AwesomeLocale,
  now: Date = new Date(),
): AwesomeInsightsStats {
  const categoryCounts = new Map<AwesomeCategoryId, number>();
  const hostCounts: Record<AwesomeRepoHost, number> = {
    github: 0,
    gitlab: 0,
  };
  const monthCounts = new Map<string, number>();

  for (const card of cards) {
    categoryCounts.set(
      card.category,
      (categoryCounts.get(card.category) ?? 0) + 1,
    );
    hostCounts[card.repoHost] += 1;
    const month = card.addedOn.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) {
      monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
    }
  }

  const categoryMix = AWESOME_CATEGORY_IDS.filter(
    (id) => (categoryCounts.get(id) ?? 0) > 0,
  )
    .map((id) => ({
      id,
      label: AWESOME_CATEGORY_LABELS[id][locale],
      count: categoryCounts.get(id)!,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const hostMix: AwesomeInsightsHostRow[] = (
    [
      { host: "github", label: "GitHub" },
      { host: "gitlab", label: "GitLab" },
    ] as const
  )
    .map((row) => ({ ...row, count: hostCounts[row.host] }))
    .filter((row) => row.count > 0);

  const addedOverTime = [...monthCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, count]) => ({
      month,
      label: formatInsightMonth(month, locale),
      count,
    }));

  const live = liveAwesomeStarCards(cards, now);

  return {
    total: cards.length,
    categoryMix,
    hostMix,
    addedOverTime,
    liveStarCount: live.length,
    starDistribution: live.length > 0 ? starDistribution(live) : null,
    topLiveStars: live.length > 0 ? topLiveStars(live) : null,
  };
}

function starDistribution(
  live: readonly AwesomePublicCard[],
): AwesomeInsightsStarBucketRow[] {
  return AWESOME_INSIGHTS_STAR_BUCKETS.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    count: live.filter((card) => {
      const count = card.starCount;
      return (
        typeof count === "number" && count >= bucket.min && count <= bucket.max
      );
    }).length,
  }));
}

function topLiveStars(
  live: readonly AwesomePublicCard[],
): AwesomeInsightsTopStarRow[] {
  return [...live]
    .sort((a, b) => {
      const delta = (b.starCount ?? 0) - (a.starCount ?? 0);
      if (delta !== 0) return delta;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 10)
    .map((card) => ({
      id: card.id,
      name: card.name,
      starCount: card.starCount!,
      repoHost: card.repoHost,
    }));
}
