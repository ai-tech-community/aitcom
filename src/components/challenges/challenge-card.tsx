"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { GitBranch } from "lucide-react";
import { ChallengeProgress } from "./challenge-progress";

const difficultyColors: Record<string, string> = {
  beginner: "text-green-600",
  intermediate: "text-blue-600",
  advanced: "text-orange-600",
  expert: "text-red-600",
};

interface ChallengeCardProps {
  challenge: {
    id: number;
    title: string;
    slug: string;
    description?: unknown;
    type: string;
    status: string;
    difficulty?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    publishedBy?: string | null;
    repo?: {
      templateUrl?: string | null;
      configFile?: boolean | null;
      testCommand?: string | null;
    } | null;
    rewards: {
      xpReward: number;
      badgeReward?: string | null;
      sponsorReward?: string | null;
    };
    objectives: {
      description: string;
      action?: string | null;
      targetCount: number;
    }[];
    tags?: unknown;
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

  const daysLeft = challenge.endsAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(challenge.endsAt).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-foreground">
              <Link
                href={`/challenges/${challenge.slug}`}
                className="hover:underline"
              >
                {challenge.title}
              </Link>
            </h3>
            {challenge.difficulty && (
              <Badge
                variant="secondary"
                className={difficultyColors[challenge.difficulty] ?? ""}
              >
                {challenge.difficulty}
              </Badge>
            )}
            {challenge.publishedBy === "sponsor" && (
              <Badge variant="outline">Sponsor</Badge>
            )}
            {challenge.repo?.templateUrl && (
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {challenge.type} &middot;{" "}
            {daysLeft === null
              ? t("openEnded")
              : daysLeft > 0
                ? t("timeLeft", { days: daysLeft })
                : t("ended")}
          </span>
        </div>
        <div className="sm:text-right">
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

      {Array.isArray(challenge.tags) && challenge.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(challenge.tags as string[]).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] tracking-wider text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {isEnrolled && (
        <div className="mt-4">
          <ChallengeProgress
            challengeId={challenge.id}
            objectives={challenge.objectives}
          />
        </div>
      )}

      <div className="mt-3 text-xs text-muted-foreground">
        {t("reward")}: {t("xp", { amount: challenge.rewards.xpReward })}
        {challenge.rewards.badgeReward && ` + badge`}
        {challenge.rewards.sponsorReward && (
          <> &middot; {challenge.rewards.sponsorReward}</>
        )}
      </div>
    </div>
  );
}
