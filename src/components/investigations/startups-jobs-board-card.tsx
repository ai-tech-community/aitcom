"use client";

import {
  ArrowRight,
  ArrowUpRight,
  HandHelping,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RelativeTime } from "@/components/ui/relative-time";
import { StartupLogo } from "@/components/investigations/startups-logo";
import type { RoleHelpRequest } from "@/lib/investigations/startup-role-help";
import {
  STARTUP_WORK_TYPE_LABELS,
  startupWorkTypeOf,
  type StartupRolePublic,
} from "@/lib/investigations/startup-roles";
import {
  TRACKING_STATUSES,
  type TrackingStatus,
} from "@/lib/investigations/startup-tracking";
import {
  buildStartupProfilePath,
  buildStartupRolePath,
} from "@/lib/investigations/startups";
import { cn } from "@/lib/utils";

/**
 * The stage a role usually moves to next. Offer and Passed are end states:
 * no single next step, so the card offers only the menu there.
 */
export function nextTrackingStatus(
  status: TrackingStatus,
): TrackingStatus | null {
  const forward: Partial<Record<TrackingStatus, TrackingStatus>> = {
    applying: "applied",
    applied: "talking",
    talking: "offer",
  };
  return forward[status] ?? null;
}

export function StartupsJobsBoardCard({
  role,
  status,
  trackedAt,
  locale,
  help,
  onMove,
  onAsk,
  onRemove,
}: {
  role: StartupRolePublic;
  status: TrackingStatus;
  trackedAt: string;
  locale: "en" | "nl";
  help: readonly RoleHelpRequest[];
  onMove: (status: TrackingStatus) => void;
  onAsk: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("jobsBoard");
  const next = nextTrackingStatus(status);
  const workType = startupWorkTypeOf(role.workType);
  const meta = [
    role.location,
    workType ? STARTUP_WORK_TYPE_LABELS[workType][locale] : null,
  ].filter(Boolean);

  return (
    <article
      data-startup-board-card={role.slug}
      className={cn(
        "bg-card border-border flex flex-col gap-3 rounded-xl border p-4",
        status === "passed" && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2">
        <StartupLogo
          card={{ name: role.startupName, logoUrl: role.startupLogoUrl }}
          size="xs"
        />
        <Link
          href={buildStartupProfilePath(role.startupSlug)}
          className="text-muted-foreground min-w-0 flex-1 truncate text-sm underline-offset-4 hover:underline"
        >
          {role.startupName}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("actions", { role: role.title })}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {TRACKING_STATUSES.filter((stage) => stage !== status).map(
              (stage) => (
                <DropdownMenuItem key={stage} onSelect={() => onMove(stage)}>
                  {t("moveTo", { stage: t(stage) })}
                </DropdownMenuItem>
              ),
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a
                href={role.applyUrl ?? role.sourceUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ArrowUpRight aria-hidden="true" />
                {t("original")}
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onAsk}>
              <HandHelping aria-hidden="true" />
              {t("ask")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <Trash2 aria-hidden="true" />
              {t("remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-1">
        <Link
          href={buildStartupRolePath(role.slug)}
          className="leading-snug font-medium underline-offset-4 hover:underline"
        >
          {role.title}
        </Link>
        {meta.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            {meta.map((part, index) => (
              <span key={index}>
                {index > 0 ? " · " : null}
                {/* Keep "Full-time" from breaking at its hyphen. */}
                <span className="whitespace-nowrap">{part}</span>
              </span>
            ))}
          </p>
        ) : null}
      </div>

      {help.length > 0 ? (
        <ul className="flex flex-col gap-2 text-xs">
          {help.map((request) => (
            <li
              key={request.communitySlug}
              data-startup-help-request={role.slug}
              className="text-muted-foreground flex gap-1.5"
            >
              <HandHelping
                aria-hidden="true"
                className="mt-px size-3.5 shrink-0"
              />
              <span className="flex min-w-0 flex-col">
                <span>
                  {t("askedIn", { community: request.communityName })}
                </span>
                <Link
                  href={request.path as never}
                  className="text-foreground w-fit underline-offset-4 hover:underline"
                >
                  {t("viewPost")}
                </Link>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 pt-1">
        <p className="text-muted-foreground text-xs">
          {t("tracked")}{" "}
          <RelativeTime date={trackedAt} className="font-sans text-xs" />
        </p>
        {next ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-board-next={next}
            className="w-full"
            onClick={() => onMove(next)}
          >
            {t("moveTo", { stage: t(next) })}
            <ArrowRight aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </article>
  );
}
