"use client";

import { useLocale, useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { upcomingEvents } from "@/lib/event-time";
import { MoreLink } from "@/components/ui/more-link";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { ChevronUp } from "lucide-react";
import { CompactEventRow } from "@/components/events/rows/compact-event-row";
import { presentEventRows } from "@/components/events/rows/event-rows";
import { useEventRowLabels } from "@/components/events/rows/use-event-row-labels";
import { toCommunityEventRowInput } from "@/components/communities/events/community-event-rows";

/** How many upcoming events the sidebar lists. */
export const SIDEBAR_EVENTS_SHOWN = 3;

interface CommunitySidebarProps {
  slug: string;
  /** "Now" for picking upcoming events; tests pin it. */
  now?: Date;
}

/**
 * Supporting context beside the feed: who is here, links, what is coming
 * up, and the ideas members back most. Discussions live in the feed itself.
 * Sections with nothing to show are left out rather than saying "none".
 */
export function CommunitySidebar({ slug, now }: CommunitySidebarProps) {
  const t = useTranslations("communities.profile");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const labels = useEventRowLabels();

  const { data: eventsData, isLoading: eventsLoading } =
    api.events.getCommunityEvents.useQuery({ communitySlug: slug });
  const { data: ideasData } = api.forum.getIdeas.useQuery({
    communitySlug: slug,
    sort: "votes",
  });
  const { data: links } = api.links.list.useQuery({ communitySlug: slug });
  const { data: community } = api.communities.getBySlug.useQuery({ slug });

  // Same rows as the community's events page, in their compact form.
  const eventRows = presentEventRows(
    upcomingEvents(eventsData ?? [], now)
      .slice(0, SIDEBAR_EVENTS_SHOWN)
      .map((event) =>
        toCommunityEventRowInput(event, {
          communitySlug: slug,
          view: "published",
          isAdminOrOwner: false,
        }),
      ),
    { locale, labels, now },
  );
  const ideas = (ideasData ?? [])
    .filter((idea) => (idea.voteCount ?? 0) > 0)
    .slice(0, 3);
  const active = community?.liveness?.activeContributors ?? 0;

  return (
    <div className="flex flex-col gap-8">
      {community ? (
        <section data-sidebar-section="about">
          <SectionHeader title={t("members")} />
          <p className="mt-3 text-sm">
            <span className="font-medium">
              {t("membersSentence", { count: community.memberCount })}
            </span>
            {active > 0 ? (
              <span className="text-muted-foreground">
                {" · "}
                {t("activeSentence", { count: active })}
              </span>
            ) : null}
          </p>
        </section>
      ) : null}

      {links && links.length > 0 ? (
        <section data-sidebar-section="links">
          <SectionHeader title={t("links")} />
          <div className="mt-3 space-y-1">
            {links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target={link.url.startsWith("http") ? "_blank" : undefined}
                rel={
                  link.url.startsWith("http")
                    ? "noopener noreferrer"
                    : undefined
                }
                className="border-border hover:bg-secondary/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors"
              >
                {link.emoji ? (
                  <span className="shrink-0">{link.emoji}</span>
                ) : null}
                <span className="truncate font-medium">{link.label}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {eventsLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      ) : eventRows.length > 0 ? (
        <section data-sidebar-section="events">
          <SectionHeader
            title={t("upcomingEvents")}
            linkHref={`/communities/${slug}/events`}
            linkLabel={tCommon("viewAll")}
          />
          <ol className="divide-border divide-y">
            {eventRows.map((row) => (
              <li key={row.key} className="min-w-0">
                <CompactEventRow
                  row={row}
                  withTime
                  where={[...row.placeParts, row.kind.label].join(" · ")}
                />
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {ideas.length > 0 ? (
        <section data-sidebar-section="ideas">
          <SectionHeader
            title={t("topIdeas")}
            linkHref={`/communities/${slug}/ideas`}
            linkLabel={tCommon("viewAll")}
          />
          <div className="mt-3 space-y-1">
            {ideas.map((idea) => (
              <Link
                key={idea.id}
                href={`/communities/${slug}/ideas` as never}
                className="border-border hover:bg-secondary/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
              >
                <div className="flex shrink-0 flex-col items-center gap-0.5 px-1">
                  <ChevronUp className="text-muted-foreground size-3" />
                  <span className="font-mono text-xs font-semibold">
                    {idea.voteCount ?? 0}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{idea.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {idea.authorName}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SectionHeader({
  title,
  linkHref,
  linkLabel,
}: {
  title: string;
  linkHref?: string;
  linkLabel?: string;
}) {
  return (
    <div className="border-border flex flex-wrap items-center justify-between gap-x-3 border-b pb-2">
      <SectionLabel bordered={false}>{title}</SectionLabel>
      {linkHref && linkLabel ? (
        <MoreLink href={linkHref}>{linkLabel}</MoreLink>
      ) : null}
    </div>
  );
}
