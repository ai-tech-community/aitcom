"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { TrophyIcon, GitBranchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChallengeProgress } from "./challenge-progress";

const difficultyColors: Record<string, string> = {
  beginner: "bg-green-500/15 text-green-600 dark:text-green-400",
  intermediate: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  advanced: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  expert: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export function ActiveChallengesWidget() {
  const t = useTranslations("challenges");
  const { data: challenges } = api.challenges.list.useQuery();
  const { data: enrollments } = api.challenges.getMyEnrollments.useQuery();

  const activeEnrollments = (enrollments ?? []).filter(
    (e) => e.status === "active",
  );

  if (activeEnrollments.length === 0) return null;

  const challengeMap = new Map(
    (challenges ?? []).map((c) => [c.id, c]),
  );

  return (
    <div>
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / ACTIVE CHALLENGES
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {activeEnrollments.map((enrollment) => {
          const challenge = challengeMap.get(enrollment.challengeId);
          if (!challenge) return null;

          const objectives =
            (challenge.objectives as {
              description: string;
              action: string;
              targetCount: number;
              verification?: string;
            }[]) ?? [];
          const daysLeft = challenge.endsAt
            ? Math.max(
                0,
                Math.ceil(
                  (new Date(challenge.endsAt).getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24),
                ),
              )
            : null;

          const difficulty = (challenge as { difficulty?: string }).difficulty;
          const repo = (challenge as { repo?: { templateUrl?: string } }).repo;
          const slug = (challenge as { slug?: string }).slug as string;
          const hasRepo = !!repo?.templateUrl;

          return (
            <Link
              key={enrollment.id}
              href={`/challenges/${slug}`}
              className="block rounded-lg border border-border p-3 transition-colors hover:bg-secondary/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrophyIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {challenge.title}
                  </span>
                  {difficulty && (
                    <Badge
                      variant="secondary"
                      className={difficultyColors[difficulty] ?? ""}
                    >
                      {difficulty}
                    </Badge>
                  )}
                  {hasRepo && (
                    <GitBranchIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {daysLeft !== null
                    ? t("timeLeft", { days: daysLeft })
                    : t("openEnded")}
                </span>
              </div>
              <div className="mt-2">
                <ChallengeProgress
                  challengeId={challenge.id}
                  objectives={objectives}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
