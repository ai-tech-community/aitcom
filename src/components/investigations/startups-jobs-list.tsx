import { ArrowUpRight } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StartupLogo } from "@/components/investigations/startups-logo";
import { StartupsJobsTrackButton } from "@/components/investigations/startups-jobs-track-button";
import {
  buildStartupProfilePath,
  buildStartupRolePath,
} from "@/lib/investigations/startups";
import {
  STARTUP_WORK_TYPE_LABELS,
  isRemoteFriendlyRole,
  startupWorkTypeOf,
  type StartupRoleListing,
} from "@/lib/investigations/startup-roles";

export type StartupsJobsListCopy = {
  caption: string;
  remote: string;
  newBadge: string;
  original: string;
  track: string;
  tracking: string;
  /** "{count} roles" for a company group header, already formatted. */
  companyRoles: (count: number) => string;
};

type Group = {
  slug: string;
  name: string;
  logoUrl: string | null;
  roles: StartupRoleListing[];
};

/**
 * One page of roles. In company order, roles sit under a company header
 * (logo, name, role count) so each company's openings read as a group;
 * other orders show the company on every row.
 */
export function StartupsJobsList({
  roles,
  grouped,
  locale,
  companyTotals,
  newSlugs,
  trackedIds,
  canTrack,
  copy,
}: {
  roles: readonly StartupRoleListing[];
  grouped: boolean;
  locale: "en" | "nl";
  /** Matching roles per company across all pages, for group headers. */
  companyTotals: ReadonlyMap<string, number>;
  newSlugs: ReadonlySet<string>;
  trackedIds: ReadonlySet<string>;
  canTrack: boolean;
  copy: StartupsJobsListCopy;
}) {
  const rowProps = { locale, newSlugs, trackedIds, canTrack, copy };

  if (!grouped) {
    return (
      <ul
        aria-label={copy.caption}
        data-jobs-list=""
        className="border-border divide-border divide-y overflow-hidden rounded-xl border"
      >
        {roles.map((role) => (
          <RoleRow key={role.id} role={role} showCompany {...rowProps} />
        ))}
      </ul>
    );
  }

  const groups: Group[] = [];
  for (const role of roles) {
    const last = groups.at(-1);
    if (last?.slug === role.startupSlug) last.roles.push(role);
    else
      groups.push({
        slug: role.startupSlug,
        name: role.startupName,
        logoUrl: role.startupLogoUrl,
        roles: [role],
      });
  }

  return (
    <div
      aria-label={copy.caption}
      role="region"
      data-jobs-list=""
      className="flex flex-col gap-4"
    >
      {groups.map((group) => (
        <section
          key={group.slug}
          aria-labelledby={`jobs-company-${group.slug}`}
          data-jobs-company={group.slug}
          className="border-border overflow-hidden rounded-xl border"
        >
          <header className="bg-muted/40 border-border flex items-center gap-3 border-b px-4 py-2.5">
            <StartupLogo card={group} size="xs" />
            <h2
              id={`jobs-company-${group.slug}`}
              className="min-w-0 flex-1 truncate text-sm font-semibold"
            >
              <Link
                href={buildStartupProfilePath(group.slug)}
                className="underline-offset-4 hover:underline"
              >
                {group.name}
              </Link>
            </h2>
            <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
              {copy.companyRoles(
                companyTotals.get(group.slug) ?? group.roles.length,
              )}
            </span>
          </header>
          <ul className="divide-border divide-y">
            {group.roles.map((role) => (
              <RoleRow
                key={role.id}
                role={role}
                showCompany={false}
                {...rowProps}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function RoleRow({
  role,
  showCompany,
  locale,
  newSlugs,
  trackedIds,
  canTrack,
  copy,
}: {
  role: StartupRoleListing;
  showCompany: boolean;
  locale: "en" | "nl";
  newSlugs: ReadonlySet<string>;
  trackedIds: ReadonlySet<string>;
  canTrack: boolean;
  copy: StartupsJobsListCopy;
}) {
  const workType = startupWorkTypeOf(role.workType);
  const meta = [
    showCompany ? { key: "company", text: role.startupName } : null,
    role.location ? { key: "location", text: role.location } : null,
    workType
      ? { key: "work-type", text: STARTUP_WORK_TYPE_LABELS[workType][locale] }
      : null,
  ].filter((part): part is { key: string; text: string } => part !== null);
  const original = role.applyUrl ?? role.sourceUrl;

  return (
    <li
      data-startup-role={role.slug}
      className="hover:bg-muted/40 has-[a[data-role-link]:focus-visible]:ring-ring/50 relative flex items-center gap-3 px-4 py-3 transition-colors has-[a[data-role-link]:focus-visible]:ring-[3px] has-[a[data-role-link]:focus-visible]:ring-inset"
    >
      {showCompany ? (
        <StartupLogo
          card={{ name: role.startupName, logoUrl: role.startupLogoUrl }}
          size="sm"
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          {/* Stretched link: the row opens the role page. */}
          <Link
            href={buildStartupRolePath(role.slug)}
            data-role-link=""
            className="truncate font-medium outline-none after:absolute after:inset-0"
          >
            {role.title}
          </Link>
          {newSlugs.has(role.slug) ? (
            <Badge variant="outline" className="shrink-0">
              {copy.newBadge}
            </Badge>
          ) : null}
        </div>
        {meta.length > 0 ? (
          <p className="text-muted-foreground truncate text-sm">
            {meta.map((part, index) => (
              <span key={part.key} data-role-meta={part.key}>
                {index > 0 ? " · " : null}
                {part.key === "company" ? (
                  // Above the stretched role link, so it stays clickable.
                  <Link
                    href={buildStartupProfilePath(role.startupSlug)}
                    className="relative z-10 underline-offset-4 hover:underline"
                  >
                    {part.text}
                  </Link>
                ) : (
                  <span
                    data-startup-role-location={
                      part.key === "location" ? "" : undefined
                    }
                  >
                    {part.text}
                  </span>
                )}
              </span>
            ))}
          </p>
        ) : null}
      </div>
      {isRemoteFriendlyRole(role) ? (
        <Badge
          variant="secondary"
          data-role-remote=""
          className="shrink-0 max-sm:hidden"
        >
          {copy.remote}
        </Badge>
      ) : null}
      <div className="relative z-10 flex shrink-0 items-center gap-0.5">
        <Button asChild variant="ghost" size="icon-sm">
          <a
            href={original}
            rel="noopener noreferrer"
            target="_blank"
            title={copy.original}
            data-role-original=""
          >
            <ArrowUpRight aria-hidden="true" />
            <span className="sr-only">{copy.original}</span>
          </a>
        </Button>
        {canTrack ? (
          <StartupsJobsTrackButton
            roleId={role.id}
            tracked={trackedIds.has(role.id)}
            trackLabel={copy.track}
            trackingLabel={copy.tracking}
          />
        ) : null}
      </div>
    </li>
  );
}
