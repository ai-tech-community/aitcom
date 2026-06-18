"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RelativeTime } from "@/components/ui/relative-time";
import { SectionLabel } from "@/components/ui/section-label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { getInitials } from "@/lib/avatar";

const ACTION_VERBS: Record<string, string> = {
  "thread.create": "created a thread",
  "thread.reply": "replied to a thread",
  "event.register": "registered for an event",
  "knowledge.share": "shared knowledge",
  "agent.created": "set up an AI agent",
  "agent.suggest_topic": "suggested a topic",
  "agent.profile_updated": "updated their agent profile",
  "idea.submitted": "submitted an idea",
  "idea.voted": "voted on an idea",
  "member.joined": "joined the community",
  "badge.earned": "earned a badge",
  "challenge.enrolled": "joined a challenge",
  "challenge.completed": "completed a challenge",
  "challenge.abandoned": "left a challenge",
  "challenge.proposed": "proposed a challenge",
  "challenge.objective_completed": "completed a challenge objective",
};

type Actor =
  | { type: "member"; displayName: string; image: string | null }
  | { type: "agent"; name: string; avatar: string | null }
  | { type: "unknown" };

function getActorName(actor: Actor): string {
  if (actor.type === "member") return actor.displayName;
  if (actor.type === "agent") return actor.name;
  return "Unknown";
}

function getActorImage(actor: Actor): string | null {
  if (actor.type === "member") return actor.image;
  if (actor.type === "agent") return actor.avatar;
  return null;
}

export function ActivityFeed() {
  const [mode, setMode] = useState<"personal" | "community">("personal");
  const t = useTranslations("activity");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    api.activity.getFeed.useInfiniteQuery(
      { mode, limit: 20 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        initialCursor: null,
      },
    );

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <SectionLabel className="pb-4">Activity</SectionLabel>

      <div className="mt-4">
        <SegmentedControl
          aria-label={t("personal")}
          size="sm"
          value={mode}
          onValueChange={setMode}
          className="font-mono tracking-wider"
          options={[
            { value: "personal", label: t("personal") },
            { value: "community", label: t("community") },
          ]}
        />
      </div>

      {/* Feed items */}
      <div className="mt-4">
        {isLoading && (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Loading...
          </p>
        )}

        {!isLoading && items.length === 0 && (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {t("empty")}
          </p>
        )}

        {items.map((item) => {
          const name = getActorName(item.actor);
          const image = getActorImage(item.actor);
          return (
            <div
              key={item.id}
              className="border-border flex items-start gap-3 border-b px-1 py-3"
            >
              <Avatar className="size-8 shrink-0">
                {image && <AvatarImage src={image} alt="" />}
                <AvatarFallback className="font-mono text-xs">
                  {getInitials(name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-sm">
                <span className="text-foreground font-medium">{name}</span>{" "}
                <span className="text-muted-foreground">
                  {ACTION_VERBS[item.action] ?? item.action}
                </span>
                {typeof item.metadata?.title === "string" && (
                  <span className="text-foreground">
                    {" "}
                    &ldquo;
                    {(item.metadata as Record<string, string>).title}
                    &rdquo;
                  </span>
                )}
              </div>
              <RelativeTime
                date={item.createdAt}
                className="text-muted-foreground text-[11px] whitespace-nowrap"
              />
            </div>
          );
        })}

        {hasNextPage && (
          <div className="mt-4 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="font-mono text-xs tracking-wider"
            >
              {isFetchingNextPage ? "Loading..." : "Load More"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
