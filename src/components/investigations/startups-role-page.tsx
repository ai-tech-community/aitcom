import { Link } from "@/i18n/navigation";
import { PromoteJoinCta } from "@/components/join/promote-join-cta";
import { JsonLd } from "@/components/json-ld";
import { SectionLabel } from "@/components/ui/section-label";
import {
  STARTUPS_JOIN_HREF,
  STARTUPS_JOBS_PATH,
  buildStartupProfilePath,
} from "@/lib/investigations/startups";
import {
  startupRoleJsonLd,
  type StartupRolePublic,
} from "@/lib/investigations/startup-roles";

export type StartupsRoleKey =
  | "kicker"
  | "jobsTitle"
  | "joinCta"
  | "hubCta"
  | "jobsBack"
  | "openOriginal"
  | "closedRole"
  | "fetchedAt"
  | "tileLocation"
  | "companyColumn";

export function StartupsRolePage({
  t,
  role,
  promoteJoin = true,
}: {
  locale: string;
  t: (key: StartupsRoleKey) => string;
  role: StartupRolePublic;
  promoteJoin?: boolean;
}) {
  const fetched = role.fetchedAt.slice(0, 10);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:px-12">
      <JsonLd data={startupRoleJsonLd(role)} />
      <nav className="text-muted-foreground text-xs">
        <Link
          href={STARTUPS_JOBS_PATH}
          className="hover:text-foreground hover:underline"
        >
          ← {t("jobsBack")}
        </Link>
      </nav>

      <SectionLabel as="div" className="mt-8">
        {t("kicker")}
      </SectionLabel>

      <div className="mt-6 flex flex-col gap-3">
        <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
          <Link
            href={buildStartupProfilePath(role.startupSlug)}
            className="hover:text-foreground hover:underline"
          >
            {role.startupName}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {role.title}
        </h1>
        {role.status === "closed" ? (
          <p className="text-muted-foreground text-sm">{t("closedRole")}</p>
        ) : null}
        {role.location ? (
          <p
            data-startup-role-location=""
            className="text-muted-foreground text-sm"
          >
            {role.location}
          </p>
        ) : null}
        {role.workType ? (
          <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
            {role.workType}
          </p>
        ) : null}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <a
          href={role.sourceUrl}
          rel="noopener noreferrer"
          data-startup-role-source=""
          className="hover:underline"
        >
          {t("openOriginal")}
        </a>
        <PromoteJoinCta
          promoteJoin={promoteJoin}
          guestHref={STARTUPS_JOIN_HREF}
          guestLabel={t("joinCta")}
          hubLabel={t("hubCta")}
          variant="outline"
        />
      </div>

      {role.descriptionText ? (
        <div
          data-startup-role-description=""
          className="text-foreground mt-10 text-sm leading-relaxed whitespace-pre-wrap"
        >
          {role.descriptionText}
        </div>
      ) : null}

      <p className="text-muted-foreground mt-12 font-mono text-xs tracking-wider">
        {t("fetchedAt")} {fetched}
      </p>
    </main>
  );
}
