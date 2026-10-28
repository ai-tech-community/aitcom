import { resolveLocale } from "@/i18n/messages";
import { ArrowLeft } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { PromoteJoinCta } from "@/components/join/promote-join-cta";
import { JsonLd } from "@/components/json-ld";
import { SectionLabel } from "@/components/ui/section-label";
import { StartupsProfileHeader } from "@/components/investigations/startups-profile-header";
import {
  StartupsProfileFacts,
  StartupsProfileLocation,
} from "@/components/investigations/startups-profile-facts";
import { StartupsProfileSections } from "@/components/investigations/startups-profile-sections";
import { StartupSourcedAnswer } from "@/components/investigations/startup-sourced-answer";
import {
  STARTUPS_JOIN_HREF,
  STARTUPS_PATH,
  startupProfileFacts,
  startupProfileJsonLd,
  startupProfileSections,
  verifiedStartupPin,
  type StartupLocale,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import type { StartupNewsMention } from "@/lib/news/startup-match";
import type { StartupRolePublic } from "@/lib/investigations/startup-roles";
import { startupSourcedAnswer } from "@/lib/investigations/startup-sourced-answers";

export type StartupsProfileKey =
  | "kicker"
  | "joinCta"
  | "hubCta"
  | "openHomepage"
  | "rolesCta"
  | "usesAi"
  | "profileBack"
  | "sectionFounders"
  | "sectionHiring"
  | "sectionNews"
  | "newsVerified"
  | "newsRumor"
  | "allRoles"
  | "factsTitle"
  | "factRegion"
  | "factStage"
  | "factListed"
  | "factSources"
  | "factLocation";

/**
 * A startup dossier: identity header, then sourced sections in a reading
 * column beside a facts sheet. Everything shown is sourced; empty topics
 * are left out rather than rendered as blank panels.
 */
export function StartupsProfilePage({
  locale,
  t,
  card,
  roles = [],
  mentions = [],
  promoteJoin = true,
}: {
  locale: string;
  t: (key: StartupsProfileKey, values?: { count: number }) => string;
  card: StartupPublicCard;
  roles?: StartupRolePublic[];
  mentions?: readonly StartupNewsMention[];
  promoteJoin?: boolean;
}) {
  const copyLocale: StartupLocale = resolveLocale(locale);
  const baseSections = startupProfileSections(card);
  const sections =
    mentions.length > 0 && !baseSections.includes("news")
      ? [...baseSections, "news" as const]
      : baseSections;
  const pin = verifiedStartupPin(card);
  const answer = startupSourcedAnswer(card.slug);

  const facts = (
    <StartupsProfileFacts
      facts={startupProfileFacts(card)}
      card={card}
      locale={copyLocale}
      copy={{
        factsTitle: t("factsTitle"),
        factRegion: t("factRegion"),
        factStage: t("factStage"),
        factListed: t("factListed"),
        factSources: t("factSources"),
      }}
    />
  );
  const location = pin ? (
    <StartupsProfileLocation pin={pin} label={t("factLocation")} />
  ) : null;
  const join = (
    <div>
      <PromoteJoinCta
        promoteJoin={promoteJoin}
        guestHref={STARTUPS_JOIN_HREF}
        guestLabel={t("joinCta")}
        hubLabel={t("hubCta")}
        variant="outline"
      />
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <JsonLd data={startupProfileJsonLd(card)} />

      <SectionLabel
        as="div"
        marker={false}
        className="flex items-center justify-between gap-4"
      >
        <span>
          <span aria-hidden="true">/ </span>
          {t("kicker")}
        </span>
        <Link
          href={STARTUPS_PATH}
          className="hover:text-foreground inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          {t("profileBack")}
        </Link>
      </SectionLabel>

      <div className="mt-10">
        <StartupsProfileHeader
          card={card}
          locale={copyLocale}
          copy={{
            openHomepage: t("openHomepage"),
            rolesCta: t("rolesCta", { count: card.openRoleCount }),
            usesAi: t("usesAi"),
          }}
        />
      </div>

      {answer ? (
        <StartupSourcedAnswer answer={answer} locale={copyLocale} />
      ) : null}

      <div className="border-border mt-12 border-t pt-12">
        {sections.length > 0 ? (
          <div
            data-startup-profile-layout="dossier"
            className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16"
          >
            <StartupsProfileSections
              sections={sections}
              card={card}
              roles={roles}
              mentions={mentions}
              locale={copyLocale}
              copy={{
                sectionFounders: t("sectionFounders"),
                sectionHiring: t("sectionHiring"),
                sectionNews: t("sectionNews"),
                allRoles: t("allRoles", { count: card.openRoleCount }),
                newsVerified: t("newsVerified"),
                newsRumor: t("newsRumor"),
              }}
            />
            <aside className="flex flex-col gap-10">
              {facts}
              {location}
              {join}
            </aside>
          </div>
        ) : (
          <div
            data-startup-profile-layout="sheet"
            className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:gap-16"
          >
            <div className="flex flex-col gap-10">
              {facts}
              {join}
            </div>
            {location}
          </div>
        )}
      </div>
    </main>
  );
}
