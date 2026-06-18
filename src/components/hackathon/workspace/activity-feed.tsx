"use client";

import { api } from "@/trpc/react";
import type { RouterOutputs } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/relative-time";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

type ActivityEvent = RouterOutputs["teamWorkspace"]["activity"][number];

export function ActivityFeed({
  teamId,
  members,
}: {
  teamId: string;
  members: { userId: string; displayName: string }[];
}) {
  const t = useTranslations("hackathon");
  const { data, isLoading, isError, refetch } =
    api.teamWorkspace.activity.useQuery(
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
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : events.length === 0 ? (
          <EmptyState title={t("noActivity")} />
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
                    <RelativeTime
                      date={event.createdAt}
                      className="text-muted-foreground shrink-0 text-xs"
                    />
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
