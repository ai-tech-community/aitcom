import { Link } from "@/i18n/navigation";
import { PromoteJoinCta } from "@/components/join/promote-join-cta";
import { JsonLd } from "@/components/json-ld";
import { SectionLabel } from "@/components/ui/section-label";
import { StartupsDirectory } from "@/components/investigations/startups-directory";
import { StartupsInsights } from "@/components/investigations/startups-insights";
import { StartupsTabs } from "@/components/investigations/startups-tabs";
import {
  STARTUPS_JOIN_HREF,
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
  | "kicker"
  | "title"
  | "lead"
  | "insightsTitle"
  | "insightsLead"
  | "backLink"
  | "joinCta"
  | "hubCta"
  | "howWeList"
  | "tabDirectory"
  | "tabInsights"
  | "tabNav"
  | "lead2"
  | "insightsLead2"
  | "categoryMixTitle"
  | "regionMixTitle"
  | "stageMixTitle"
  | "sourcesCoverageTitle"
  | "addedOverTimeTitle"
  | "chartCaption"
  | "regionOmitted"
  | "stageOmitted"
  | "sourcesOmitted"
  | "categoryColumn"
  | "regionColumn"
  | "stageColumn"
  | "sourcesColumn"
  | "monthColumn"
  | "countColumn"
  | "empty"
  | "emptyHelp";

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
  t: (key: StartupsKey) => string;
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

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      {!isInsights && companies.length > 0 ? (
        <JsonLd data={startupsDirectoryJsonLd(companies)} />
      ) : null}
      <nav className="text-muted-foreground text-xs">
        <Link
          href="/investigations"
          className="hover:text-foreground hover:underline"
        >
          ← {t("backLink")}
        </Link>
      </nav>

      <SectionLabel as="div" className="mt-8">
        {t("kicker")}
      </SectionLabel>

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
          <StartupsInsights
            stats={insightStats!}
            copy={{
              categoryMixTitle: t("categoryMixTitle"),
              regionMixTitle: t("regionMixTitle"),
              stageMixTitle: t("stageMixTitle"),
              sourcesCoverageTitle: t("sourcesCoverageTitle"),
              addedOverTimeTitle: t("addedOverTimeTitle"),
              chartCaption: t("chartCaption"),
              regionOmitted: t("regionOmitted"),
              stageOmitted: t("stageOmitted"),
              sourcesOmitted: t("sourcesOmitted"),
              categoryColumn: t("categoryColumn"),
              regionColumn: t("regionColumn"),
              stageColumn: t("stageColumn"),
              sourcesColumn: t("sourcesColumn"),
              monthColumn: t("monthColumn"),
              countColumn: t("countColumn"),
              empty: t("empty"),
            }}
          />
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
