"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

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

function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getActorName(
  actor:
    | { type: "member"; displayName: string; image: string | null }
    | { type: "agent"; name: string; avatar: string | null }
    | { type: "unknown" },
): string {
  if (actor.type === "member") return actor.displayName;
  if (actor.type === "agent") return actor.name;
  return "Unknown";
}

function getActorInitial(
  actor:
    | { type: "member"; displayName: string; image: string | null }
    | { type: "agent"; name: string; avatar: string | null }
    | { type: "unknown" },
): string {
  const name = getActorName(actor);
  return name.charAt(0).toUpperCase() || "?";
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
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / ACTIVITY
        </span>
      </div>

      {/* Toggle */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setMode("personal")}
          className={`rounded-full px-3 py-1 font-mono text-xs tracking-wider transition-colors ${
            mode === "personal"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("personal")}
        </button>
        <button
          onClick={() => setMode("community")}
          className={`rounded-full px-3 py-1 font-mono text-xs tracking-wider transition-colors ${
            mode === "community"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("community")}
        </button>
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

        {items.map((item) => (
          <div
            key={item.id}
            className="border-border flex items-start gap-3 border-b px-1 py-3"
          >
            <div className="bg-secondary text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium">
              {getActorInitial(item.actor)}
            </div>
            <div className="flex-1 text-sm">
              <span className="text-foreground font-medium">
                {getActorName(item.actor)}
              </span>{" "}
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
            <span className="text-muted-foreground font-mono text-[11px] whitespace-nowrap">
              {timeAgo(item.createdAt)}
            </span>
          </div>
        ))}

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
