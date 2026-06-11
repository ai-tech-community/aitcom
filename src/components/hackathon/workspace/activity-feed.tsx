"use client";

import { api } from "@/trpc/react";
import type { RouterOutputs } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

type ActivityEvent = RouterOutputs["teamWorkspace"]["activity"][number];

function relativeTime(date: Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  if (Number.isNaN(then)) return "";
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${Math.max(sec, 0)}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(date).toLocaleString();
}

export function ActivityFeed({
  teamId,
  members,
}: {
  teamId: string;
  members: { userId: string; displayName: string }[];
}) {
  const t = useTranslations("hackathon");
  const { data } = api.teamWorkspace.activity.useQuery(
    { teamId },
    { refetchInterval: 5_000 },
  );

  const memberMap = new Map(members.map((m) => [m.userId, m.displayName]));

  const verb = (type: ActivityEvent["type"]): string => {
    switch (type) {
      case "assigned":
        return t("actAssigned");
      case "claimed":
        return t("actClaimed");
      case "reported":
        return t("actReported");
      case "verified":
        return t("actVerified");
      case "failed":
        return t("actFailed");
      default:
        return type;
    }
  };

  const events = data ? [...data] : [];
  events.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("activity")}</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noActivity")}</p>
        ) : (
          <ScrollArea className="h-64">
            <ul className="space-y-2 pr-3">
              {events.map((event) => {
                const actor = event.actorUserId
                  ? (memberMap.get(event.actorUserId) ?? event.actorUserId)
                  : event.actorAgentId
                    ? t("anAgent")
                    : "—";
                return (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{actor}</span>{" "}
                      <span className="text-muted-foreground">
                        {verb(event.type)}
                      </span>
                    </span>
                    <span className="text-muted-foreground shrink-0 font-mono text-xs">
                      {relativeTime(event.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
