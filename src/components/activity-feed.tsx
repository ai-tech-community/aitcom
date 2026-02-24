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
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
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
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading...
          </p>
        )}

        {!isLoading && items.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )}

        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 border-b border-border px-1 py-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs font-medium text-muted-foreground">
              {getActorInitial(item.actor)}
            </div>
            <div className="flex-1 text-sm">
              <span className="font-medium text-foreground">
                {getActorName(item.actor)}
              </span>{" "}
              <span className="text-muted-foreground">
                {ACTION_VERBS[item.action] ?? item.action}
              </span>
              {(item.metadata as Record<string, unknown> | null)?.title && (
                <span className="text-foreground">
                  {" "}
                  &ldquo;
                  {String(
                    (item.metadata as Record<string, unknown>).title,
                  )}
                  &rdquo;
                </span>
              )}
            </div>
            <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
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
