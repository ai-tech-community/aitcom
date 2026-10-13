import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { StartupsFounderRoster } from "@/components/investigations/startups-founders";
import { StartupsSourceChips } from "@/components/investigations/startups-source-chips";
import { Badge } from "@/components/ui/badge";
import {
  buildStartupJobsPath,
  buildStartupRolePath,
  displayStartupFounders,
  startupNewsSources,
  type StartupLocale,
  type StartupProfileSection,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import type { StartupNewsMention } from "@/lib/news/startup-match";
import type { StartupRolePublic } from "@/lib/investigations/startup-roles";

/** Roles listed inline before the "see all" link takes over. */
const ROLES_SHOWN = 6;

export type StartupsProfileSectionsCopy = {
  sectionFounders: string;
  sectionHiring: string;
  sectionNews: string;
  allRoles: string;
  newsVerified: string;
  newsRumor: string;
};

/** Main reading column: one section per sourced topic, ruled apart. */
export function StartupsProfileSections({
  sections,
  card,
  roles,
  mentions = [],
  locale,
  copy,
}: {
  sections: readonly StartupProfileSection[];
  card: StartupPublicCard;
  roles: readonly StartupRolePublic[];
  mentions?: readonly StartupNewsMention[];
  locale: StartupLocale;
  copy: StartupsProfileSectionsCopy;
}) {
  return (
    <div className="divide-border flex min-w-0 flex-col divide-y">
      {sections.map((section) => {
        switch (section) {
          case "founders": {
            const founders = displayStartupFounders(card.founders);
            return (
              <ProfileSection
                key={section}
                id={section}
                title={copy.sectionFounders}
                count={founders.length}
              >
                <StartupsFounderRoster
                  founders={founders}
                  label={copy.sectionFounders}
                />
              </ProfileSection>
            );
          }
          case "hiring":
            return (
              <ProfileSection
                key={section}
                id={section}
                title={copy.sectionHiring}
                count={card.openRoleCount}
              >
                <HiringList card={card} roles={roles} copy={copy} />
              </ProfileSection>
            );
          case "news": {
            const news = startupNewsSources(card.sources);
            if (news.length === 0 && mentions.length === 0) return null;
            return (
              <ProfileSection
                key={section}
                id={section}
                title={copy.sectionNews}
                count={news.length + mentions.length}
              >
                {news.length > 0 ? (
                  <StartupsSourceChips sources={news} locale={locale} />
                ) : null}
                {mentions.length > 0 ? (
                  <StartupMentionList
                    mentions={mentions}
                    locale={locale}
                    copy={copy}
                  />
                ) : null}
              </ProfileSection>
            );
          }
        }
      })}
    </div>
  );
}

function ProfileSection({
  id,
  title,
  count,
  children,
}: {
  id: StartupProfileSection;
  title: string;
  count: number;
  children: ReactNode;
}) {
  const headingId = `startup-section-${id}`;
  return (
    <section
      aria-labelledby={headingId}
      data-startup-profile-section={id}
      className="flex flex-col gap-5 py-8 first:pt-0 last:pb-0"
    >
      <h2
        id={headingId}
        className="flex items-baseline gap-3 text-lg font-semibold tracking-tight"
      >
        {title}
        <span className="text-muted-foreground font-mono text-xs font-medium tabular-nums">
          {count}
        </span>
      </h2>
      {children}
    </section>
  );
}

function StartupMentionList({
  mentions,
  locale,
  copy,
}: {
  mentions: readonly StartupNewsMention[];
  locale: StartupLocale;
  copy: StartupsProfileSectionsCopy;
}) {
  const format = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  return (
    <ul
      data-startup-news-mentions=""
      className="border-border divide-border divide-y border"
    >
      {mentions.map((item) => {
        const external =
          item.href.startsWith("https://") || item.href.startsWith("http://");
        const title = external ? (
          <a
            href={item.href}
            rel="noopener noreferrer"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {item.title}
          </a>
        ) : (
          <Link
            href={item.href}
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {item.title}
          </Link>
        );
        return (
          <li
            key={`${item.kind}-${item.id}`}
            className="flex flex-col gap-2 px-4 py-3"
          >
            {title}
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span>{item.source}</span>
              {item.at ? (
                <span className="font-mono text-xs">
                  {format.format(new Date(item.at))}
                </span>
              ) : null}
              <Badge variant={item.kind === "story" ? "success" : "warning"}>
                {item.kind === "story" ? copy.newsVerified : copy.newsRumor}
              </Badge>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function HiringList({
  card,
  roles,
  copy,
}: {
  card: StartupPublicCard;
  roles: readonly StartupRolePublic[];
  copy: StartupsProfileSectionsCopy;
}) {
  const shown = roles.slice(0, ROLES_SHOWN);

  return (
    <div data-startup-hiring="" className="flex flex-col gap-4">
      {shown.length > 0 ? (
        <ul className="border-border divide-border divide-y overflow-hidden rounded-xl border">
          {shown.map((role) => (
            <li
              key={role.id}
              className="group hover:bg-muted/50 has-[a:focus-visible]:ring-ring/50 relative flex items-center gap-4 px-4 py-3 transition-colors has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-inset"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {/* Stretched link: the whole row is the target, the title is its name. */}
                <Link
                  href={buildStartupRolePath(role.slug)}
                  className="truncate font-medium outline-none after:absolute after:inset-0"
                >
                  {role.title}
                </Link>
                {role.location ? (
                  <span
                    data-startup-hiring-location=""
                    className="text-muted-foreground truncate text-sm"
                  >
                    {role.location}
                  </span>
                ) : null}
              </div>
              {role.workType ? (
                <span
                  data-startup-hiring-work-type=""
                  className="text-muted-foreground hidden font-mono text-xs tracking-wider uppercase sm:inline"
                >
                  {role.workType}
                </span>
              ) : null}
              <ArrowRight
                aria-hidden="true"
                className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
              />
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href={buildStartupJobsPath({ company: card.slug })}
        data-startup-all-roles=""
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
      >
        {copy.allRoles}
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </div>
  );
}
