import { STARTUP_ROLES_PER_COMPANY_CAP } from "./startup-roles";
import {
  STARTUP_CATEGORY_IDS,
  STARTUP_CATEGORY_LABELS,
  displayStartupLogoUrl,
  displayStartupSources,
  presentText,
  type StartupCategoryId,
  type StartupLocale,
  type StartupPublicCard,
} from "./startups";
import { startupCountryOf } from "./startups-countries";

/** Countries shown by name; the rest fold into one "other countries" row. */
export const STARTUPS_INSIGHTS_TOP_COUNTRIES = 10;

/** Soft-omit "Where they are" until this many countries are listed. */
export const STARTUPS_INSIGHTS_COUNTRIES_MIN = 5;

/** Companies named in "Who is hiring" when none reach the scan cap. */
export const STARTUPS_INSIGHTS_TOP_HIRING = 8;

/**
 * Open-role bands for hiring companies. The last band starts at the scan
 * cap, so "40+" is the only band whose true size may be larger.
 */
export const STARTUPS_INSIGHTS_ROLE_BANDS = [
  { min: 1, max: 4 },
  { min: 5, max: 9 },
  { min: 10, max: 19 },
  { min: 20, max: STARTUP_ROLES_PER_COMPANY_CAP - 1 },
  { min: STARTUP_ROLES_PER_COMPANY_CAP, max: null },
] as const;

export type StartupsInsightsRoleBand = {
  min: number;
  /** null for the open-ended cap band. */
  max: number | null;
  count: number;
};

/** A timeline needs a shape; until listings span this many months, omit it. */
export const STARTUPS_INSIGHTS_TIMELINE_MIN_MONTHS = 3;

export type StartupsInsightsCountryRow = { country: string; count: number };

export type StartupsInsightsCategoryRow = {
  id: StartupCategoryId;
  label: string;
  count: number;
  /** Companies in this category with at least one sourced open role. */
  hiring: number;
};

export type StartupsInsightsHiringRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  roles: number;
  /** The scan stops at the per-company cap, so the real count may be higher. */
  capped: boolean;
};

export type StartupsInsightsMonthRow = {
  month: string;
  label: string;
  count: number;
};

export type StartupsInsightsStageRow = { stage: string; count: number };

export type StartupsInsightsStats = {
  total: number;
  /** Distinct countries with at least one listed company. */
  countryCount: number;
  countries: {
    /** Top countries, largest first. */
    rows: StartupsInsightsCountryRow[];
    /** Companies in countries past the top list, and how many countries. */
    other: { companies: number; countries: number };
    /** Companies whose place is not one country (remote, multi-region). */
    unplaced: number;
  } | null;
  categories: StartupsInsightsCategoryRow[];
  hiring: {
    companies: number;
    roles: number;
    /** True when any company hit the cap, so `roles` is a floor. */
    rolesCapped: boolean;
    /** Hiring companies by number of open roles. */
    bands: StartupsInsightsRoleBand[];
    /**
     * Companies with the most openings: every company at the cap (a tie the
     * scan cannot break), else the top few by count.
     */
    top: StartupsInsightsHiringRow[];
  };
  exits: { acquired: number; ipo: number; shutdown: number };
  /** Companies by number of cited sources; always all three buckets. */
  sourceDepth: Array<{ sources: 1 | 2 | 3; count: number }>;
  timeline: StartupsInsightsMonthRow[] | null;
  stageMix: StartupsInsightsStageRow[] | null;
};

/**
 * Display names for the share sentence only. The stat is still the sourced
 * country from `countries.rows` ("United States"); this is how that country
 * reads in prose.
 */
const SHARE_COUNTRY_DISPLAY: Record<string, Record<StartupLocale, string>> = {
  "United States": { en: "the US", nl: "de VS" },
  "United Kingdom": { en: "the UK", nl: "het VK" },
};

export function startupInsightsCountryShareLabel(
  country: string,
  locale: StartupLocale,
): string {
  return SHARE_COUNTRY_DISPLAY[country]?.[locale] ?? country;
}

export type StartupsInsightsShareFacts = {
  companies: number;
  hiringCompanies: number;
  roles: number;
  /** True when `roles` is a floor (`hiring.rolesCapped`). */
  rolesCapped: boolean;
  /**
   * Top two countries when they are a majority of companies with a known
   * country. Null otherwise — the card omits the map line.
   */
  mapLeaders: { first: string; second: string } | null;
  /** Leading category when it is strictly ahead. Null on a tie or when empty. */
  categoryLead: string | null;
};

/**
 * Share-card and Open Graph facts from the same Insights aggregate.
 * Counts are `total`, `hiring.companies`, `hiring.roles`, and
 * `hiring.rolesCapped`. Map and category lines use `countries.rows` and
 * `categories` and are omitted when those claims would not be true.
 */
export function startupInsightsShareFacts(
  stats: StartupsInsightsStats,
  locale: StartupLocale,
): StartupsInsightsShareFacts {
  const countries = stats.countries;
  const [first, second] = countries?.rows ?? [];
  const placed = countries ? stats.total - countries.unplaced : 0;
  const mapLeaders =
    countries &&
    first &&
    second &&
    placed > 0 &&
    (first.count + second.count) / placed > 0.5
      ? {
          first: startupInsightsCountryShareLabel(first.country, locale),
          second: startupInsightsCountryShareLabel(second.country, locale),
        }
      : null;

  const [lead, next] = stats.categories;
  const categoryLead =
    lead && lead.count > 0 && (!next || lead.count > next.count)
      ? lead.label
      : null;

  return {
    companies: stats.total,
    hiringCompanies: stats.hiring.companies,
    roles: stats.hiring.roles,
    rolesCapped: stats.hiring.rolesCapped,
    mapLeaders,
    categoryLead,
  };
}

export type StartupInsightsShareLine = {
  id: "listed" | "hiring" | "map";
  key:
    | "shareProofListed"
    | "shareProofHiring"
    | "shareProofMap"
    | "shareProofMapOnly"
    | "shareProofCategory";
  values: Record<string, string | number>;
};

/** Proof tiles. Empty claims are left out so the card never invents a line. */
export function startupInsightsShareLines(
  facts: StartupsInsightsShareFacts,
): StartupInsightsShareLine[] {
  if (facts.companies <= 0) return [];
  const lines: StartupInsightsShareLine[] = [
    {
      id: "listed",
      key: "shareProofListed",
      values: { companies: facts.companies },
    },
  ];
  if (facts.hiringCompanies > 0) {
    lines.push({
      id: "hiring",
      key: "shareProofHiring",
      values: {
        companies: facts.hiringCompanies,
        roles: facts.roles,
        capped: String(facts.rolesCapped),
      },
    });
  }
  if (facts.mapLeaders && facts.categoryLead) {
    lines.push({
      id: "map",
      key: "shareProofMap",
      values: {
        first: facts.mapLeaders.first,
        second: facts.mapLeaders.second,
        category: facts.categoryLead,
      },
    });
  } else if (facts.mapLeaders) {
    lines.push({
      id: "map",
      key: "shareProofMapOnly",
      values: {
        first: facts.mapLeaders.first,
        second: facts.mapLeaders.second,
      },
    });
  } else if (facts.categoryLead) {
    lines.push({
      id: "map",
      key: "shareProofCategory",
      values: { category: facts.categoryLead },
    });
  }
  return lines;
}

export type StartupInsightsOgSpec = {
  titleKey: "shareOgTitle" | "shareOgTitleNoHiring";
  titleValues: Record<string, number>;
  descriptionKey: "shareOgDescription" | "shareOgDescriptionNoHiring";
  descriptionValues: Record<string, string | number>;
};

/** Null when the directory is empty — callers keep the static Insights title. */
export function startupInsightsOgSpec(
  facts: StartupsInsightsShareFacts,
): StartupInsightsOgSpec | null {
  if (facts.companies <= 0) return null;
  if (facts.hiringCompanies <= 0) {
    return {
      titleKey: "shareOgTitleNoHiring",
      titleValues: { companies: facts.companies },
      descriptionKey: "shareOgDescriptionNoHiring",
      descriptionValues: { companies: facts.companies },
    };
  }
  return {
    titleKey: "shareOgTitle",
    titleValues: {
      companies: facts.companies,
      hiring: facts.hiringCompanies,
    },
    descriptionKey: "shareOgDescription",
    descriptionValues: {
      companies: facts.companies,
      hiring: facts.hiringCompanies,
      roles: facts.roles,
      capped: String(facts.rolesCapped),
    },
  };
}

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

function increment<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * Aggregates listed directory cards into counts of sourced fields only.
 * Never invents valuation, headcount, attendance, or growth rates.
 */
export function buildStartupInsights(
  cards: readonly StartupPublicCard[],
  locale: StartupLocale,
): StartupsInsightsStats {
  const countryCounts = new Map<string, number>();
  const categoryCounts = new Map<StartupCategoryId, number>();
  const categoryHiring = new Map<StartupCategoryId, number>();
  const stageCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();
  const depthCounts = new Map<1 | 2 | 3, number>();
  const exits = { acquired: 0, ipo: 0, shutdown: 0 };
  let unplaced = 0;
  let hiringCompanies = 0;
  let roles = 0;
  let rolesCapped = false;

  for (const card of cards) {
    const country = startupCountryOf(card.region);
    if (country) increment(countryCounts, country);
    else unplaced += 1;

    increment(categoryCounts, card.category);
    if (card.openRoleCount > 0) {
      increment(categoryHiring, card.category);
      hiringCompanies += 1;
      roles += card.openRoleCount;
      if (card.openRoleCount >= STARTUP_ROLES_PER_COMPANY_CAP) {
        rolesCapped = true;
      }
    }

    const stage = presentText(card.stage);
    if (stage) increment(stageCounts, stage);

    const month = card.listedOn.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) increment(monthCounts, month);

    const depth = Math.min(displayStartupSources(card.sources).length, 3);
    if (depth === 1 || depth === 2 || depth === 3) {
      increment(depthCounts, depth);
    }

    if (card.exitStatus) exits[card.exitStatus] += 1;
  }

  const rankedCountries = [...countryCounts.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
  const topCountries = rankedCountries.slice(
    0,
    STARTUPS_INSIGHTS_TOP_COUNTRIES,
  );
  const restCountries = rankedCountries.slice(STARTUPS_INSIGHTS_TOP_COUNTRIES);

  const categories = STARTUP_CATEGORY_IDS.filter(
    (id) => (categoryCounts.get(id) ?? 0) > 0,
  )
    .map((id) => ({
      id,
      label: STARTUP_CATEGORY_LABELS[id][locale],
      count: categoryCounts.get(id)!,
      hiring: categoryHiring.get(id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const hiringCards = cards
    .filter((card) => card.openRoleCount > 0)
    .sort(
      (a, b) =>
        b.openRoleCount - a.openRoleCount || a.name.localeCompare(b.name),
    );
  const atCap = hiringCards.filter(
    (card) => card.openRoleCount >= STARTUP_ROLES_PER_COMPANY_CAP,
  );
  const hiringTop = (
    atCap.length > 0
      ? atCap
      : hiringCards.slice(0, STARTUPS_INSIGHTS_TOP_HIRING)
  ).map((card) => ({
    id: card.id,
    name: card.name,
    slug: card.slug,
    logoUrl: displayStartupLogoUrl(card.logoUrl),
    roles: card.openRoleCount,
    capped: card.openRoleCount >= STARTUP_ROLES_PER_COMPANY_CAP,
  }));

  const months = [...monthCounts.keys()].sort();

  return {
    total: cards.length,
    countryCount: countryCounts.size,
    countries:
      countryCounts.size >= STARTUPS_INSIGHTS_COUNTRIES_MIN
        ? {
            rows: topCountries,
            other: {
              companies: restCountries.reduce((sum, row) => sum + row.count, 0),
              countries: restCountries.length,
            },
            unplaced,
          }
        : null,
    categories,
    hiring: {
      companies: hiringCompanies,
      roles,
      rolesCapped,
      bands: STARTUPS_INSIGHTS_ROLE_BANDS.map((band) => ({
        min: band.min,
        max: band.max,
        count: hiringCards.filter(
          (card) =>
            card.openRoleCount >= band.min &&
            (band.max === null || card.openRoleCount <= band.max),
        ).length,
      })),
      top: hiringTop,
    },
    exits,
    sourceDepth: ([1, 2, 3] as const).map((sources) => ({
      sources,
      count: depthCounts.get(sources) ?? 0,
    })),
    timeline:
      months.length >= STARTUPS_INSIGHTS_TIMELINE_MIN_MONTHS
        ? months.map((month) => ({
            month,
            label: formatStartupInsightMonth(month, locale),
            count: monthCounts.get(month)!,
          }))
        : null,
    stageMix:
      stageCounts.size === 0
        ? null
        : [...stageCounts.entries()]
            .map(([stage, count]) => ({ stage, count }))
            .sort(
              (a, b) => b.count - a.count || a.stage.localeCompare(b.stage),
            ),
  };
}
