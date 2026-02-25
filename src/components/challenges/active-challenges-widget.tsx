"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { TrophyIcon } from "lucide-react";
import { ChallengeProgress } from "./challenge-progress";

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
            }[]) ?? [];
          const daysLeft = Math.max(
            0,
            Math.ceil(
              (new Date(challenge.endsAt).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24),
            ),
          );

          return (
            <Link
              key={enrollment.id}
              href="/dashboard/challenges"
              className="block rounded-lg border border-border p-3 transition-colors hover:bg-secondary/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrophyIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {challenge.title}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {t("timeLeft", { days: daysLeft })}
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
