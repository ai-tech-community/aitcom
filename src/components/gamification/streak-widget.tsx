"use client";

import { api } from "@/trpc/react";
import { StreakCard } from "@/components/gamification/streak-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";

/**
 * The signed-in member's activity streak on the dashboard. Streak data is
 * derived from activityEvents server-side (members.getMyStreak) — no streak
 * table. Handles the three data states per the No-Silent-Failure Rule.
 */
export function StreakWidget() {
  const { data, isLoading, isError, refetch } =
    api.members.getMyStreak.useQuery();

  if (isLoading) {
    return <Skeleton className="h-80 w-full rounded-xl" />;
  }
  if (isError) {
    return <ErrorState onRetry={() => void refetch()} />;
  }
  if (!data) return null;

  return (
    <StreakCard
      streak={data.streak}
      currentStreak={data.currentStreak}
      longestStreak={data.longestStreak}
      total={data.total}
    />
  );
}
