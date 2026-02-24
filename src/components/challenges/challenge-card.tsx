"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ChallengeProgress } from "./challenge-progress";

interface ChallengeCardProps {
  challenge: {
    id: number;
    title: string;
    type: string;
    status: string;
    startsAt: string;
    endsAt: string;
    xpReward: number;
    badgeReward?: string | null;
    objectives: { description: string; action: string; targetCount: number }[];
  };
  isEnrolled: boolean;
}

export function ChallengeCard({ challenge, isEnrolled }: ChallengeCardProps) {
  const t = useTranslations("challenges");
  const utils = api.useUtils();

  const enroll = api.challenges.enroll.useMutation({
    onSuccess: () => {
      void utils.challenges.getMyEnrollments.invalidate();
      void utils.challenges.getProgress.invalidate({
        challengeId: challenge.id,
      });
    },
  });

  const abandon = api.challenges.abandon.useMutation({
    onSuccess: () => {
      void utils.challenges.getMyEnrollments.invalidate();
    },
  });

  const daysLeft = Math.max(
    0,
    Math.ceil(
      (new Date(challenge.endsAt).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24),
    ),
  );

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-foreground">{challenge.title}</h3>
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {challenge.type} &middot;{" "}
            {daysLeft > 0 ? t("timeLeft", { days: daysLeft }) : t("ended")}
          </span>
        </div>
        <div className="text-right">
          {!isEnrolled ? (
            <Button
              size="sm"
              className="font-mono text-xs tracking-wider"
              onClick={() => enroll.mutate({ challengeId: challenge.id })}
              disabled={enroll.isPending || daysLeft === 0}
            >
              {t("join")}
            </Button>
          ) : (
            <span className="rounded-full bg-secondary px-3 py-1 font-mono text-xs tracking-wider text-muted-foreground">
              {t("joined")}
            </span>
          )}
        </div>
      </div>

      {isEnrolled && (
        <div className="mt-4">
          <ChallengeProgress
            challengeId={challenge.id}
            objectives={challenge.objectives}
          />
        </div>
      )}

      <div className="mt-3 text-xs text-muted-foreground">
        {t("reward")}: {t("xp", { amount: challenge.xpReward })}
        {challenge.badgeReward && ` + badge`}
      </div>
    </div>
  );
}
