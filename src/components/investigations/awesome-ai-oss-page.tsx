import { Link } from "@/i18n/navigation";
import { PromoteJoinCta } from "@/components/join/promote-join-cta";
import { JsonLd } from "@/components/json-ld";
import { SectionLabel } from "@/components/ui/section-label";
import { AwesomeAiOssDirectory } from "@/components/investigations/awesome-ai-oss-directory";
import { AwesomeAiOssInsights } from "@/components/investigations/awesome-ai-oss-insights";
import { AwesomeAiOssTabs } from "@/components/investigations/awesome-ai-oss-tabs";
import {
  AWESOME_AI_OSS_JOIN_HREF,
  curatedPublicCards,
  type AwesomeDirectoryQuery,
  type AwesomeLocale,
  type AwesomePublicCard,
} from "@/lib/investigations/awesome-ai-oss";
import { awesomeDirectoryJsonLd } from "@/lib/investigations/awesome-ai-oss-jsonld";
import {
  buildAwesomeInsights,
  type AwesomeInsightsStats,
} from "@/lib/investigations/awesome-ai-oss-insights";
import { GUIDE_PATHS } from "@/lib/seo-guides";

export type AwesomeAiOssKey =
  | "kicker"
  | "title"
  | "lead"
  | "insightsTitle"
  | "insightsLead"
  | "backLink"
  | "hubVsRegistryTitle"
  | "hubVsRegistryBody"
  | "hubVsRegistryLink"
  | "howWePickTitle"
  | "howWePickBody"
  | "protocols"
  | "runtimes"
  | "frameworks"
  | "rag"
  | "models"
  | "other"
  | "gitlab"
  | "gitlabNote"
  | "joinTitle"
  | "joinLead"
  | "joinCta"
  | "hubCta"
  | "registerAgentLabel"
  | "starTooltip"
  | "learnMore"
  | "tabDirectory"
  | "tabInsights"
  | "tabNav"
  | "categoryMixTitle"
  | "hostMixTitle"
  | "addedOverTimeTitle"
  | "starDistributionTitle"
  | "topStarsTitle"
  | "chartCaption"
  | "starsOmitted"
  | "categoryColumn"
  | "hostColumn"
  | "monthColumn"
  | "countColumn"
  | "projectColumn"
  | "liveStarColumn"
  | "empty";

export function AwesomeAiOssPage({
  locale,
  t,
  projects = curatedPublicCards(),
  signedIn = false,
  promoteJoin = !signedIn,
  isModerator = false,
  query = { q: "", category: "all", sort: "newest", page: 1 },
  signInHref = "/en/auth/signin?redirect=/en/investigations/awesome-ai-oss",
  tab = "directory",
  insights,
}: {
  locale: string;
  t: (key: AwesomeAiOssKey) => string;
  projects?: AwesomePublicCard[];
  signedIn?: boolean;
  promoteJoin?: boolean;
  isModerator?: boolean;
  query?: AwesomeDirectoryQuery;
  signInHref?: string;
  tab?: "directory" | "insights";
  insights?: AwesomeInsightsStats;
}) {
  const copyLocale: AwesomeLocale = locale === "nl" ? "nl" : "en";
  const isInsights = tab === "insights";
  const insightStats =
    insights ??
    (isInsights ? buildAwesomeInsights(projects, copyLocale) : undefined);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      {isInsights ? null : <JsonLd data={awesomeDirectoryJsonLd(projects)} />}
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

      <div className="mt-8 max-w-2xl space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {isInsights ? t("insightsTitle") : t("title")}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {isInsights ? t("insightsLead") : t("lead")}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <AwesomeAiOssTabs
          active={isInsights ? "insights" : "directory"}
          directoryLabel={t("tabDirectory")}
          insightsLabel={t("tabInsights")}
          navLabel={t("tabNav")}
        />
        <PromoteJoinCta
          promoteJoin={promoteJoin}
          guestHref={AWESOME_AI_OSS_JOIN_HREF}
          guestLabel={t("joinCta")}
          hubLabel={t("hubCta")}
          variant={isInsights ? "default" : "outline"}
        />
      </div>

      <section className="mt-10">
        {isInsights ? (
          <AwesomeAiOssInsights
            stats={insightStats!}
            copy={{
              categoryMixTitle: t("categoryMixTitle"),
              hostMixTitle: t("hostMixTitle"),
              addedOverTimeTitle: t("addedOverTimeTitle"),
              starDistributionTitle: t("starDistributionTitle"),
              topStarsTitle: t("topStarsTitle"),
              chartCaption: t("chartCaption"),
              starsOmitted: t("starsOmitted"),
              categoryColumn: t("categoryColumn"),
              hostColumn: t("hostColumn"),
              monthColumn: t("monthColumn"),
              countColumn: t("countColumn"),
              projectColumn: t("projectColumn"),
              liveStarColumn: t("liveStarColumn"),
              empty: t("empty"),
            }}
          />
        ) : (
          <AwesomeAiOssDirectory
            projects={projects}
            signedIn={signedIn}
            isModerator={isModerator}
            locale={copyLocale}
            initialQuery={query}
            signInHref={signInHref}
          />
        )}
      </section>

      <p className="text-muted-foreground mt-16 text-sm leading-relaxed">
        <Link
          href={GUIDE_PATHS.registerAgentMcp}
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          {t("registerAgentLabel")}
        </Link>
      </p>
    </main>
  );
}
