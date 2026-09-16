import { Link } from "@/i18n/navigation";
import { PromoteJoinCta } from "@/components/join/promote-join-cta";
import { JsonLd } from "@/components/json-ld";
import { SectionLabel } from "@/components/ui/section-label";
import { StartupsFounders } from "@/components/investigations/startups-founders";
import { StartupsProfileOverview } from "@/components/investigations/startups-profile-overview";
import { StartupsProfileTabs } from "@/components/investigations/startups-profile-tabs";
import { StartupsSourceChips } from "@/components/investigations/startups-source-chips";
import {
  STARTUPS_JOIN_HREF,
  STARTUPS_PATH,
  displayStartupFounders,
  formatStartupExitBadge,
  presentText,
  startupNewsSources,
  startupProfileExtraTabs,
  startupProfileJsonLd,
  type StartupLocale,
  type StartupPublicCard,
} from "@/lib/investigations/startups";

export type StartupsProfileKey =
  | "kicker"
  | "joinCta"
  | "hubCta"
  | "openHomepage"
  | "openJobs"
  | "profileBack"
  | "tabOverview"
  | "tabNews"
  | "tabHiring"
  | "tabFunding"
  | "tabTeam"
  | "tabProfileNav"
  | "tileLogo"
  | "tileBlurb"
  | "tileCategory"
  | "tileRegion"
  | "tileStage"
  | "tileExit"
  | "tileFounders"
  | "tileJobs"
  | "tileSources"
  | "tileMap";

export function StartupsProfilePage({
  locale,
  t,
  card,
  promoteJoin = true,
}: {
  locale: string;
  t: (key: StartupsProfileKey) => string;
  card: StartupPublicCard;
  promoteJoin?: boolean;
}) {
  const copyLocale: StartupLocale = locale === "nl" ? "nl" : "en";
  const extraTabs = startupProfileExtraTabs(card);
  const news = startupNewsSources(card.sources);
  const jobsUrl = presentText(card.jobsUrl);
  const exitBadge = formatStartupExitBadge(card, copyLocale);
  const founders = displayStartupFounders(card.founders);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <JsonLd data={startupProfileJsonLd(card)} />
      <nav className="text-muted-foreground text-xs">
        <Link
          href={STARTUPS_PATH}
          className="hover:text-foreground hover:underline"
        >
          ← {t("profileBack")}
        </Link>
      </nav>

      <SectionLabel as="div" className="mt-8">
        {t("kicker")}
      </SectionLabel>

      <div className="mt-6 flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {card.name}
        </h1>
        <a
          href={card.homepage}
          rel="noopener noreferrer"
          data-startup-homepage=""
          className="text-muted-foreground w-fit text-sm hover:underline"
        >
          {t("openHomepage")}
        </a>
      </div>

      <div className="mt-8">
        <StartupsProfileTabs
          extraTabs={extraTabs}
          aside={
            <PromoteJoinCta
              promoteJoin={promoteJoin}
              guestHref={STARTUPS_JOIN_HREF}
              guestLabel={t("joinCta")}
              hubLabel={t("hubCta")}
              variant="outline"
            />
          }
          copy={{
            overview: t("tabOverview"),
            news: t("tabNews"),
            hiring: t("tabHiring"),
            funding: t("tabFunding"),
            team: t("tabTeam"),
            nav: t("tabProfileNav"),
          }}
          overview={
            <StartupsProfileOverview
              card={card}
              locale={copyLocale}
              copy={{
                tileLogo: t("tileLogo"),
                tileBlurb: t("tileBlurb"),
                tileCategory: t("tileCategory"),
                tileRegion: t("tileRegion"),
                tileStage: t("tileStage"),
                tileExit: t("tileExit"),
                tileFounders: t("tileFounders"),
                tileJobs: t("tileJobs"),
                tileSources: t("tileSources"),
                tileMap: t("tileMap"),
                openJobs: t("openJobs"),
              }}
            />
          }
          news={
            news.length > 0 ? (
              <StartupsSourceChips
                sources={news}
                locale={copyLocale}
                label={t("tabNews")}
              />
            ) : undefined
          }
          hiring={
            jobsUrl ? (
              <a
                href={jobsUrl}
                rel="noopener noreferrer"
                data-startup-jobs=""
                className="hover:underline"
              >
                {t("openJobs")}
              </a>
            ) : undefined
          }
          funding={
            exitBadge ? (
              <p data-startup-exit={card.exitStatus ?? ""}>{exitBadge}</p>
            ) : undefined
          }
          team={
            founders.length > 0 ? (
              <StartupsFounders founders={founders} label={t("tabTeam")} />
            ) : undefined
          }
        />
      </div>
    </main>
  );
}
