"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { formatEventTimeRange, upcomingEvents } from "@/lib/event-time";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { Calendar, ChevronUp } from "lucide-react";

const typeLabels: Record<string, string> = {
  workshop: "WORKSHOP",
  hackathon: "HACKATHON",
  deep_dive: "DEEP-DIVE",
  meetup: "MEETUP",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

interface CommunitySidebarProps {
  slug: string;
}

/**
 * Supporting context beside the feed: who is here, links, what is coming
 * up, and the ideas members back most. Discussions live in the feed itself.
 * Sections with nothing to show are left out rather than saying "none".
 */
export function CommunitySidebar({ slug }: CommunitySidebarProps) {
  const t = useTranslations("communities.profile");

  const { data: eventsData, isLoading: eventsLoading } =
    api.events.getCommunityEvents.useQuery({ communitySlug: slug });
  const { data: ideasData } = api.forum.getIdeas.useQuery({
    communitySlug: slug,
    sort: "votes",
  });
  const { data: links } = api.links.list.useQuery({ communitySlug: slug });
  const { data: community } = api.communities.getBySlug.useQuery({ slug });

  const events = upcomingEvents(eventsData ?? []).slice(0, 3);
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
      ) : events.length > 0 ? (
        <section data-sidebar-section="events">
          <SectionHeader
            title={t("upcomingEvents")}
            linkHref={`/communities/${slug}/events`}
            linkLabel={t("viewAll")}
          />
          <div className="mt-3 space-y-1">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.slug}` as never}
                className="border-border hover:bg-secondary/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
              >
                <Calendar className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{event.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(event.date)}
                    {event.startTime &&
                      ` · ${formatEventTimeRange({
                        date: event.date,
                        startTime: event.startTime,
                        endTime: event.endTime,
                        timezone: event.timezone,
                      })}`}
                    {event.location && ` · ${event.location}`}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-xs uppercase">
                  {typeLabels[event.type] ?? event.type}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {ideas.length > 0 ? (
        <section data-sidebar-section="ideas">
          <SectionHeader
            title={t("topIdeas")}
            linkHref={`/communities/${slug}/ideas`}
            linkLabel={t("viewAll")}
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
    <div className="border-border flex items-center justify-between border-b pb-2">
      <SectionLabel bordered={false}>{title}</SectionLabel>
      {linkHref && linkLabel ? (
        <Link
          href={linkHref as never}
          className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider transition-colors"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}
