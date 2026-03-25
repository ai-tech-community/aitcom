"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { MessageSquare, Calendar, ChevronUp } from "lucide-react";

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

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function CommunityOverviewPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities.profile");
  const tRoles = useTranslations("communities.roles");

  const { data: community } = api.communities.getBySlug.useQuery({ slug });

  const { data: membersData, isLoading: membersLoading } =
    api.communities.getMembers.useQuery({ slug, limit: 6 });

  const { data: threadsData, isLoading: threadsLoading } =
    api.forum.getThreads.useQuery({
      communitySlug: slug,
      sort: "lastActive",
      limit: 5,
    });

  const { data: eventsData, isLoading: eventsLoading } =
    api.events.getCommunityEvents.useQuery({ communitySlug: slug });

  const { data: ideasData, isLoading: ideasLoading } =
    api.forum.getIdeas.useQuery({ communitySlug: slug, sort: "votes" });

  if (!community) {
    return null;
  }

  const threads = threadsData?.threads ?? [];
  const events = (eventsData ?? []).slice(0, 3);
  const ideas = (ideasData ?? []).slice(0, 5);

  return (
    <div className="flex flex-col gap-10">
      {/* About */}
      {community.description ? (
        <section>
          <SectionHeader title="/ ABOUT" />
          <p className="text-muted-foreground mt-4 whitespace-pre-wrap text-sm leading-relaxed">
            {community.description}
          </p>
        </section>
      ) : null}

      {/* Recent Discussions */}
      <section>
        <SectionHeader
          title={`/ ${t("recentThreads").toUpperCase()}`}
          linkHref={`/communities/${slug}/forum`}
          linkLabel={t("viewAll")}
          show={threads.length > 0}
        />
        {threadsLoading ? (
          <Skeleton count={3} />
        ) : threads.length === 0 ? (
          <EmptyState>{t("noThreadsYet")}</EmptyState>
        ) : (
          <div className="mt-3 space-y-1">
            {threads.map((thread) => (
              <Link
                key={thread.id}
                href={`/forum/${thread.slug}` as never}
                className="border-border hover:bg-secondary/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
              >
                <MessageSquare className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{thread.title}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {thread.authorName} · {timeAgo(thread.lastActivityAt ?? thread.createdAt)}
                    {(thread.replyCount ?? 0) > 0 && ` · ${t("replies", { count: thread.replyCount ?? 0 })}`}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[9px] uppercase">
                  {thread.category}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Events */}
      <section>
        <SectionHeader
          title={`/ ${t("upcomingEvents").toUpperCase()}`}
          linkHref={`/communities/${slug}/events`}
          linkLabel={t("viewAll")}
          show={events.length > 0}
        />
        {eventsLoading ? (
          <Skeleton count={2} />
        ) : events.length === 0 ? (
          <EmptyState>{t("noEventsYet")}</EmptyState>
        ) : (
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
                  <p className="text-muted-foreground text-[11px]">
                    {formatDate(event.date)}
                    {event.startTime && ` · ${event.startTime}`}
                    {event.location && ` · ${event.location}`}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[9px] uppercase">
                  {typeLabels[event.type] ?? event.type}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Top Ideas */}
      <section>
        <SectionHeader
          title={`/ ${t("topIdeas").toUpperCase()}`}
          linkHref={`/communities/${slug}/ideas`}
          linkLabel={t("viewAll")}
          show={ideas.length > 0}
        />
        {ideasLoading ? (
          <Skeleton count={3} />
        ) : ideas.length === 0 ? (
          <EmptyState>{t("noIdeasYet")}</EmptyState>
        ) : (
          <div className="mt-3 space-y-1">
            {ideas.map((idea) => (
              <div
                key={idea.id}
                className="border-border hover:bg-secondary/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
              >
                <div className="flex shrink-0 flex-col items-center gap-0.5 px-1">
                  <ChevronUp className="text-muted-foreground size-3" />
                  <span className="font-mono text-[10px] font-bold">{idea.voteCount ?? 0}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{idea.title}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {idea.authorName}
                  </p>
                </div>
                <Badge
                  variant={idea.status === "implemented" ? "default" : "secondary"}
                  className="shrink-0 text-[9px] uppercase"
                >
                  {idea.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Members */}
      <section>
        <SectionHeader
          title={`/ ${t("members").toUpperCase()} (${community.memberCount})`}
          linkHref={`/communities/${slug}/members`}
          linkLabel={t("viewAll")}
          show={community.memberCount > 6}
        />
        {membersLoading ? (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-muted h-14 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : membersData?.items.length ? (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {membersData.items.map((member) => (
              <div
                key={member.userId}
                className="border-border hover:bg-secondary/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
              >
                <Avatar className="size-8">
                  {member.image ? (
                    <AvatarImage
                      src={member.image}
                      alt={member.displayName ?? ""}
                    />
                  ) : null}
                  <AvatarFallback className="text-xs">
                    {(member.displayName ?? "?")[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {member.displayName ?? "Member"}
                  </p>
                </div>
                {member.role !== "member" && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {tRoles(member.role)}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>No members yet.</EmptyState>
        )}
      </section>
    </div>
  );
}

function SectionHeader({
  title,
  linkHref,
  linkLabel,
  show = true,
}: {
  title: string;
  linkHref?: string;
  linkLabel?: string;
  show?: boolean;
}) {
  return (
    <div className="border-border flex items-center justify-between border-b pb-2">
      <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
        {title}
      </h2>
      {show && linkHref && linkLabel ? (
        <Link
          href={linkHref as never}
          className="text-muted-foreground hover:text-foreground font-mono text-[10px] tracking-wider transition-colors"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

function Skeleton({ count }: { count: number }) {
  return (
    <div className="mt-3 space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-muted h-14 animate-pulse rounded-lg" />
      ))}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground mt-6 text-center font-mono text-xs tracking-wider">
      {children}
    </p>
  );
}
