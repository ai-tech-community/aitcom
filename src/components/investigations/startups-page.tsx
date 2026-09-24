import { PromoteJoinCta } from "@/components/join/promote-join-cta";
import { JsonLd } from "@/components/json-ld";
import { SectionLabel } from "@/components/ui/section-label";
import { StartupsDirectory } from "@/components/investigations/startups-directory";
import {
  StartupsInsights,
  type StartupsInsightsKey,
} from "@/components/investigations/startups-insights";
import { StartupsTabs } from "@/components/investigations/startups-tabs";
import {
  STARTUPS_JOIN_HREF,
  applyStartupDirectoryQuery,
  paginateStartupCards,
  parseStartupDirectoryQuery,
  startupsDirectoryJsonLd,
  type StartupDirectoryQuery,
  type StartupLocale,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import {
  buildStartupInsights,
  type StartupsInsightsStats,
} from "@/lib/investigations/startups-insights";

export type StartupsKey =
  | StartupsInsightsKey
  | "kicker"
  | "title"
  | "lead"
  | "insightsTitle"
  | "insightsLead"
  | "joinCta"
  | "hubCta"
  | "howWeList"
  | "tabDirectory"
  | "tabInsights"
  | "tabJobs"
  | "tabNav"
  | "lead2"
  | "insightsLead2";

export function StartupsPage({
  locale,
  t,
  companies = [],
  isModerator = false,
  query = { q: "", category: "all", sort: "newest", page: 1 },
  tab = "directory",
  insights,
  promoteJoin = true,
}: {
  locale: string;
  t: (key: StartupsKey, values?: Record<string, string | number>) => string;
  companies?: StartupPublicCard[];
  isModerator?: boolean;
  query?: StartupDirectoryQuery;
  tab?: "directory" | "insights";
  insights?: StartupsInsightsStats;
  promoteJoin?: boolean;
}) {
  const copyLocale: StartupLocale = locale === "nl" ? "nl" : "en";
  const isInsights = tab === "insights";
  const insightStats =
    insights ??
    (isInsights ? buildStartupInsights(companies, copyLocale) : undefined);
  const directoryQuery = parseStartupDirectoryQuery(query);
  const directoryPage = isInsights
    ? null
    : paginateStartupCards(
        applyStartupDirectoryQuery(companies, directoryQuery, copyLocale),
        directoryQuery.page,
      );

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      {directoryPage && directoryPage.items.length > 0 ? (
        <JsonLd data={startupsDirectoryJsonLd(directoryPage.items)} />
      ) : null}

      <SectionLabel as="div">{t("kicker")}</SectionLabel>

      <div className="mt-6 flex max-w-2xl flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {isInsights ? t("insightsTitle") : t("title")}
        </h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          {isInsights ? t("insightsLead") : t("lead")}
        </p>
        <p className="text-muted-foreground text-base leading-relaxed">
          {isInsights ? t("insightsLead2") : t("lead2")}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <StartupsTabs
          active={isInsights ? "insights" : "directory"}
          directoryLabel={t("tabDirectory")}
          insightsLabel={t("tabInsights")}
          jobsLabel={t("tabJobs")}
          navLabel={t("tabNav")}
        />
        <PromoteJoinCta
          promoteJoin={promoteJoin}
          guestHref={STARTUPS_JOIN_HREF}
          guestLabel={t("joinCta")}
          hubLabel={t("hubCta")}
          variant={isInsights ? "default" : "outline"}
        />
      </div>

      <section className="mt-10">
        {isInsights ? (
          <StartupsInsights stats={insightStats!} locale={copyLocale} t={t} />
        ) : (
          <StartupsDirectory
            companies={companies}
            isModerator={isModerator}
            locale={copyLocale}
            initialQuery={query}
          />
        )}
      </section>

      <p className="text-muted-foreground mt-16 text-sm leading-relaxed">
        {t("howWeList")}
      </p>
    </main>
  );
}
