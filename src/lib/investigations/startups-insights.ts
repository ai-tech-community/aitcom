import {
  STARTUP_CATEGORY_IDS,
  STARTUP_CATEGORY_LABELS,
  presentText,
  type StartupCategoryId,
  type StartupLocale,
  type StartupPublicCard,
} from "./startups";

export const STARTUPS_INSIGHTS_CAPTION =
  "from listed companies · Neon only";

export type StartupsInsightsCategoryRow = {
  id: StartupCategoryId;
  label: string;
  count: number;
};

export type StartupsInsightsRegionRow = {
  region: string;
  count: number;
};

export type StartupsInsightsMonthRow = {
  month: string;
  label: string;
  count: number;
};

export type StartupsInsightsStats = {
  total: number;
  categoryMix: StartupsInsightsCategoryRow[];
  regionMix: StartupsInsightsRegionRow[] | null;
  addedOverTime: StartupsInsightsMonthRow[];
};

export function isStartupInsightsTab(
  value: string | string[] | undefined,
): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "insights";
}

export function formatStartupInsightMonth(
  month: string,
  locale: StartupLocale,
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
 * Aggregates listed directory cards. Never invents valuation, headcount,
 * attendance, or growth — only category / verified region / listed-on counts.
 */
export function buildStartupInsights(
  cards: readonly StartupPublicCard[],
  locale: StartupLocale,
): StartupsInsightsStats {
  const categoryCounts = new Map<StartupCategoryId, number>();
  const regionCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();

  for (const card of cards) {
    categoryCounts.set(
      card.category,
      (categoryCounts.get(card.category) ?? 0) + 1,
    );
    const region = presentText(card.region);
    if (region) {
      regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
    }
    const month = card.listedOn.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) {
      monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
    }
  }

  const categoryMix = STARTUP_CATEGORY_IDS.filter(
    (id) => (categoryCounts.get(id) ?? 0) > 0,
  )
    .map((id) => ({
      id,
      label: STARTUP_CATEGORY_LABELS[id][locale],
      count: categoryCounts.get(id)!,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const regionMix =
    regionCounts.size === 0
      ? null
      : [...regionCounts.entries()]
          .map(([region, count]) => ({ region, count }))
          .sort((a, b) => b.count - a.count || a.region.localeCompare(b.region));

  const addedOverTime = [...monthCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, count]) => ({
      month,
      label: formatStartupInsightMonth(month, locale),
      count,
    }));

  return {
    total: cards.length,
    categoryMix,
    regionMix,
    addedOverTime,
  };
}
