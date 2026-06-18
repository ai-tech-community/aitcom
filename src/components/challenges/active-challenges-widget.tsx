"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { TrophyIcon, GitBranchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import { ChallengeProgress } from "./challenge-progress";

export function ActiveChallengesWidget() {
  const t = useTranslations("challenges");
  const { data: challenges } = api.challenges.list.useQuery();
  const { data: enrollments } = api.challenges.getMyEnrollments.useQuery();

  const activeEnrollments = (enrollments ?? []).filter(
    (e) => e.status === "active",
  );

  if (activeEnrollments.length === 0) return null;

  const challengeMap = new Map((challenges ?? []).map((c) => [c.id, c]));

  return (
    <div>
      <SectionLabel className="pb-4">Active Challenges</SectionLabel>

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
          const slug = (challenge as { slug?: string }).slug!;
          const hasRepo = !!repo?.templateUrl;

          return (
            <Link
              key={enrollment.id}
              href={`/challenges/${slug}`}
              className="border-border hover:bg-secondary/30 block rounded-lg border p-3 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrophyIcon className="text-muted-foreground h-4 w-4" />
                  <span className="text-sm font-medium">{challenge.title}</span>
                  {difficulty && (
                    <Badge variant="secondary" className="capitalize">
                      {difficulty}
                    </Badge>
                  )}
                  {hasRepo && (
                    <GitBranchIcon className="text-muted-foreground h-3.5 w-3.5" />
                  )}
                </div>
                <span className="text-muted-foreground font-mono text-xs">
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
