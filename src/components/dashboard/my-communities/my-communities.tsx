"use client";

import * as React from "react";
import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { getInitials } from "@/lib/avatar";
import { isCommunityOrganizer } from "@/lib/communities/organizer-roles";
import {
  communityHref,
  communityMemberSettingsHref,
  communitySettingsHref,
} from "@/lib/communities/routes";
import { api, type RouterOutputs } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InviteResponse } from "@/components/communities/invite-response";
import type { InviteAnswer } from "@/components/communities/use-community-join";
import { ArrowLink } from "@/components/dashboard/arrow-link";
import {
  DashboardSection,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { ListSkeleton } from "@/components/dashboard/list-skeleton";

type Membership = RouterOutputs["communities"]["getMyCommunities"][number];

function runsCommunity(membership: Membership): boolean {
  return isCommunityOrganizer(membership.role);
}

function CommunityIdentity({
  membership,
  nameId,
}: {
  membership: Membership;
  nameId: string;
}) {
  return (
    <Link
      href={communityHref(membership.slug) as never}
      data-community-link={membership.slug}
      className="focus-visible:ring-ring/50 group flex min-w-0 flex-1 items-center gap-3 rounded-sm outline-none focus-visible:ring-[3px]"
    >
      <Avatar aria-hidden className="size-9 rounded-md">
        {membership.logoUrl ? (
          <AvatarImage src={membership.logoUrl} alt="" />
        ) : null}
        <AvatarFallback className="rounded-md text-xs">
          {getInitials(membership.name)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0">
        <span
          id={nameId}
          className="block truncate text-sm font-medium underline-offset-4 group-hover:underline"
        >
          {membership.name}
        </span>
        {membership.description ? (
          <span className="text-muted-foreground line-clamp-1 text-sm">
            {membership.description}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * A community the member is in: the community itself is the row's link;
 * role, join requests and Manage sit beside it as their own controls (never
 * nested inside the link). Join requests show only on rows the member runs.
 */
function ActiveRow({
  membership,
  joinRequests,
}: {
  membership: Membership;
  joinRequests: number;
}) {
  const t = useTranslations("communities.dashboard");
  const tRoles = useTranslations("communities.roles");
  const nameId = React.useId();
  const runs = runsCommunity(membership);

  return (
    <li
      data-slot="my-community-row"
      data-list="active"
      className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-4"
    >
      <CommunityIdentity membership={membership} nameId={nameId} />
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        <Badge variant="secondary">{tRoles(membership.role)}</Badge>
        {runs && joinRequests > 0 && (
          <Button asChild size="sm" variant="secondary">
            <Link
              href={communityMemberSettingsHref(membership.slug) as never}
              aria-describedby={nameId}
            >
              {t("joinRequests", { count: joinRequests })}
            </Link>
          </Button>
        )}
        {runs && (
          <Button asChild size="sm" variant="outline">
            <Link
              href={communitySettingsHref(membership.slug) as never}
              aria-describedby={nameId}
            >
              <Settings aria-hidden />
              {t("manage")}
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * A request the member sent, or an invitation they have not answered. An
 * invitation is answered right here (Accept / Decline); a request waits on
 * the organizers.
 */
function WaitingRow({
  membership,
  onAnswered,
}: {
  membership: Membership;
  onAnswered: (answer: InviteAnswer) => void;
}) {
  const t = useTranslations("communities.dashboard");
  const nameId = React.useId();
  const invited = membership.status === "invited";
  return (
    <li
      data-slot="my-community-row"
      data-list="waiting"
      className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-4"
    >
      <CommunityIdentity membership={membership} nameId={nameId} />
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        <Badge variant="outline">
          {invited ? t("invited") : t("requested")}
        </Badge>
        {invited && (
          <InviteResponse
            variant="row"
            slug={membership.slug}
            name={membership.name}
            describedBy={nameId}
            onAnswered={onAnswered}
          />
        )}
      </div>
    </li>
  );
}

/**
 * Keeps keyboard and screen-reader users in place after they answer an
 * invitation, whose row then moves or goes away. Once the list has
 * reloaded: an accepted community's link (now among "Your communities"),
 * or after a decline the first invitation or request still waiting, else
 * the tab itself.
 */
function useFocusAfterAnswer(listKey: string) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [target, setTarget] = React.useState<{
    slug: string;
    answer: InviteAnswer;
  } | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!target || !container) return;
    const links = Array.from(
      container.querySelectorAll<HTMLElement>("[data-community-link]"),
    );
    const inList = (link: HTMLElement, list: "active" | "waiting") =>
      link.closest<HTMLElement>("[data-list]")?.dataset.list === list;
    const own = links.find((l) => l.dataset.communityLink === target.slug);

    if (target.answer === "accept") {
      // Wait for the reload that moves the row into the active list.
      if (!own || !inList(own, "active")) return;
      own.focus();
    } else {
      // Wait for the reload that removes the row.
      if (own) return;
      const next = links.find((l) => inList(l, "waiting"));
      (next ?? container).focus();
    }
    setTarget(null);
  }, [target, listKey]);

  return {
    containerRef,
    answered: (slug: string, answer: InviteAnswer) =>
      setTarget({ slug, answer }),
  };
}

function MyCommunitiesEmpty() {
  const t = useTranslations("communities.dashboard");
  return (
    <EmptyState
      className="px-0 py-8"
      title={t("emptyTitle")}
      description={t("emptyDescription")}
      action={<ArrowLink href="/communities">{t("explore")}</ArrowLink>}
    />
  );
}

/**
 * The My communities tab: communities the member is in, then requests and
 * invitations still waiting. A failed load shows an error with retry, never
 * "you have none". Rows the member runs show how many join requests wait,
 * from the same grouped count Home's Next up uses.
 */
export function MyCommunities() {
  const t = useTranslations("communities.dashboard");
  const query = api.communities.getMyCommunities.useQuery();
  const memberships = query.data ?? [];
  const active = memberships.filter((m) => m.status === "active");
  const waiting = memberships.filter(
    (m) => m.status === "pending_approval" || m.status === "invited",
  );
  const runsAny = active.some(runsCommunity);
  const focusAfterAnswer = useFocusAfterAnswer(
    memberships.map((m) => `${m.slug}:${m.status}`).join(","),
  );

  // Supplementary to the rows: only asked for when the member runs a
  // community, and a failed count leaves the rows as they are (Next up on
  // Home carries the same count).
  const requests = api.communities.getMyPendingJoinRequests.useQuery(
    undefined,
    { enabled: runsAny },
  );
  const requestCounts = new Map(
    (requests.data ?? []).map((row) => [row.communityId, row.count]),
  );

  return (
    <div
      ref={focusAfterAnswer.containerRef}
      tabIndex={-1}
      className="space-y-10 outline-none"
    >
      <DashboardSection
        title={t("title")}
        // "Haven't joined" only when there is nothing at all; a member who
        // is only waiting gets a neutral line and the waiting list below.
        status={statusFromQueries(query, {
          isEmpty: active.length === 0 && waiting.length === 0,
        })}
        skeleton={<ListSkeleton />}
        empty={<MyCommunitiesEmpty />}
      >
        {active.length > 0 ? (
          <ul className="divide-border -mt-3 divide-y">
            {active.map((membership) => (
              <ActiveRow
                key={membership.communityId}
                membership={membership}
                joinRequests={requestCounts.get(membership.communityId) ?? 0}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm text-pretty">
            {t("onlyWaiting")}
          </p>
        )}
      </DashboardSection>

      {waiting.length > 0 && (
        <DashboardSection title={t("waitingTitle")}>
          <ul className="divide-border -mt-3 divide-y">
            {waiting.map((membership) => (
              <WaitingRow
                key={membership.communityId}
                membership={membership}
                onAnswered={(answer) =>
                  focusAfterAnswer.answered(membership.slug, answer)
                }
              />
            ))}
          </ul>
        </DashboardSection>
      )}
    </div>
  );
}
