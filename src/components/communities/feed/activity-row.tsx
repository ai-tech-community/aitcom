"use client";

import type { ReactNode } from "react";
import { ChevronUp, Lightbulb, MessageSquare } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { getInitials } from "@/lib/avatar";
import { formatEventTimeRange } from "@/lib/event-time";
import type { RouterOutputs } from "@/trpc/react";

type FeedItem = RouterOutputs["feed"]["getActivity"]["items"][number];
type ActivityItem = Exclude<FeedItem, { kind: "post" }>;
type Member = { id: string; name: string; image: string | null };

/**
 * A non-post moment in the community feed: a question, an idea, an event,
 * or people joining. One line says who did what and when; the thing itself
 * sits below as a link, so the row reads as news, not as another post.
 */
export function ActivityRow({
  item,
  slug,
}: {
  item: ActivityItem;
  slug: string;
}) {
  const t = useTranslations("communities.feed");
  const tp = useTranslations("communities.profile");

  switch (item.kind) {
    case "thread": {
      const { thread } = item;
      const name = thread.authorName ?? t("someone");
      const sentence =
        thread.category === "question"
          ? t("activityAsked", { name })
          : thread.category === "showcase"
            ? t("activityShowcase", { name })
            : thread.category === "job"
              ? t("activityJob", { name })
              : t("activityDiscussion", { name });
      return (
        <RowFrame
          kind={item.kind}
          lead={<PersonAvatar name={name} image={thread.authorImage} />}
          sentence={sentence}
          at={item.at}
        >
          <Link
            href={`/communities/${slug}/forum/${thread.slug}` as never}
            className="border-border hover:bg-muted/50 focus-visible:ring-ring/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors outline-none focus-visible:ring-[3px]"
          >
            <MessageSquare
              aria-hidden="true"
              className="text-muted-foreground size-4 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {thread.title}
              </span>
              {thread.replyCount > 0 ? (
                <span className="text-muted-foreground text-xs">
                  {tp("replies", { count: thread.replyCount })}
                </span>
              ) : null}
            </span>
            {thread.category && thread.category !== "general" ? (
              <Badge variant="secondary" className="shrink-0 capitalize">
                {thread.category}
              </Badge>
            ) : null}
          </Link>
        </RowFrame>
      );
    }
    case "idea": {
      const { idea } = item;
      const name = idea.authorName ?? t("someone");
      return (
        <RowFrame
          kind={item.kind}
          lead={<PersonAvatar name={name} image={idea.authorImage} />}
          sentence={t("activityIdea", { name })}
          at={item.at}
        >
          <Link
            href={`/communities/${slug}/ideas` as never}
            className="border-border hover:bg-muted/50 focus-visible:ring-ring/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors outline-none focus-visible:ring-[3px]"
          >
            <Lightbulb
              aria-hidden="true"
              className="text-muted-foreground size-4 shrink-0"
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {idea.title}
            </span>
            <span className="text-muted-foreground flex shrink-0 items-center gap-0.5 font-mono text-xs tabular-nums">
              <ChevronUp aria-hidden="true" className="size-3.5" />
              {tp("votes", { count: idea.voteCount })}
            </span>
          </Link>
        </RowFrame>
      );
    }
    case "event": {
      const { event } = item;
      return (
        <RowFrame
          kind={item.kind}
          lead={<EventDateTile date={event.date} />}
          sentence={t("activityEvent")}
          at={item.at}
        >
          <Link
            href={`/events/${event.slug}` as never}
            className="border-border hover:bg-muted/50 focus-visible:ring-ring/50 flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 transition-colors outline-none focus-visible:ring-[3px]"
          >
            <span className="truncate text-sm font-medium">{event.title}</span>
            <EventMeta event={event} />
          </Link>
        </RowFrame>
      );
    }
    case "joins":
      return (
        <RowFrame
          kind={item.kind}
          lead={<MemberFaces members={item.members} />}
          sentence={joinedSentence(item.members, t)}
          at={item.at}
        />
      );
  }
}

function RowFrame({
  kind,
  lead,
  sentence,
  at,
  children,
}: {
  kind: string;
  lead: ReactNode;
  sentence: string;
  at: string;
  children?: ReactNode;
}) {
  return (
    <article data-activity-row={kind} className="flex gap-3 px-1 py-2">
      <div className="flex w-8 shrink-0 justify-center pt-0.5">{lead}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground">{sentence}</span>
          <span aria-hidden="true"> · </span>
          <RelativeTime date={at} className="font-sans" />
        </p>
        {children}
      </div>
    </article>
  );
}

function PersonAvatar({ name, image }: { name: string; image: string | null }) {
  return (
    <Avatar className="size-8">
      {image ? <AvatarImage src={image} alt="" /> : null}
      <AvatarFallback className="text-xs">{getInitials(name)}</AvatarFallback>
    </Avatar>
  );
}

function MemberFaces({ members }: { members: readonly Member[] }) {
  const shown = members.slice(0, 3);
  return (
    <span className="relative flex h-8 w-8 items-center">
      {shown.map((member, index) => (
        <Avatar
          key={member.id}
          className="ring-background absolute size-6 ring-2"
          style={{ left: index * 6, top: index * 4 }}
        >
          {member.image ? <AvatarImage src={member.image} alt="" /> : null}
          <AvatarFallback className="text-xs">
            {getInitials(member.name || "?")}
          </AvatarFallback>
        </Avatar>
      ))}
    </span>
  );
}

function EventDateTile({ date }: { date: string }) {
  const format = useFormatter();
  const day = new Date(date);
  return (
    <span className="border-border bg-background flex size-9 flex-col items-center justify-center gap-0.5 rounded-md border leading-none">
      <span className="text-muted-foreground font-mono text-xs uppercase">
        {format.dateTime(day, { month: "short", timeZone: "UTC" })}
      </span>
      <span className="text-xs font-semibold tabular-nums">
        {format.dateTime(day, { day: "numeric", timeZone: "UTC" })}
      </span>
    </span>
  );
}

function EventMeta({
  event,
}: {
  event: Extract<ActivityItem, { kind: "event" }>["event"];
}) {
  const format = useFormatter();
  const parts = [
    format.dateTime(new Date(event.date), {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
    event.startTime
      ? formatEventTimeRange({
          date: event.date,
          startTime: event.startTime,
          endTime: event.endTime,
          timezone: event.timezone,
        })
      : null,
    event.location,
  ].filter(Boolean);
  return (
    <span className="text-muted-foreground truncate text-xs">
      {parts.join(" · ")}
    </span>
  );
}

function joinedSentence(
  members: readonly Member[],
  t: ReturnType<typeof useTranslations<"communities.feed">>,
): string {
  const names = members.map((member) => member.name || t("someone"));
  if (names.length === 1) return t("joinedOne", { first: names[0]! });
  if (names.length === 2) {
    return t("joinedTwo", { first: names[0]!, second: names[1]! });
  }
  return t("joinedMany", {
    first: names[0]!,
    second: names[1]!,
    count: names.length - 2,
  });
}
