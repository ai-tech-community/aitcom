"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { GitBranch } from "lucide-react";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { ChallengeProgress } from "./challenge-progress";

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
    objectives?:
      | {
          description: string;
          action?: string | null;
          targetCount: number;
        }[]
      | null;
    tags?: unknown;
    collaborationModel?: string | null;
    generatedBy?: string | null;
  };
  isEnrolled: boolean;
}

export function ChallengeCard({ challenge, isEnrolled }: ChallengeCardProps) {
  const t = useTranslations("challenges");
  const utils = api.useUtils();
  const { requireAuth } = useRequireAuth();

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
    <div className="border-border rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-foreground font-medium">
              <Link
                href={`/challenges/${challenge.slug}`}
                className="hover:underline"
              >
                {challenge.title}
              </Link>
            </h3>
            {challenge.difficulty && (
              <Badge variant="secondary">{challenge.difficulty}</Badge>
            )}
            {challenge.publishedBy === "sponsor" && (
              <Badge variant="outline">Sponsor</Badge>
            )}
            {challenge.repo?.templateUrl && (
              <GitBranch className="text-muted-foreground h-3.5 w-3.5" />
            )}
            {challenge.collaborationModel &&
              challenge.collaborationModel !== "solo-ai" && (
                <Badge variant="secondary">
                  {challenge.collaborationModel === "relay" && "Relay"}
                  {challenge.collaborationModel === "swarm" && "Swarm"}
                  {challenge.collaborationModel === "adversarial" &&
                    "Adversarial"}
                  {challenge.collaborationModel === "blind" && "Blind"}
                  {challenge.collaborationModel === "escalation" &&
                    "Escalation"}
                </Badge>
              )}
            {challenge.generatedBy === "ai" && (
              <Badge variant="outline">AI</Badge>
            )}
          </div>
          <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
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
              onClick={() =>
                requireAuth(
                  () => enroll.mutate({ challengeId: challenge.id }),
                  "Sign in to join this challenge",
                )
              }
              disabled={enroll.isPending || daysLeft === 0}
            >
              {t("join")}
            </Button>
          ) : (
            <span className="bg-secondary text-muted-foreground rounded-full px-3 py-1 font-mono text-xs tracking-wider">
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
              className="bg-secondary text-muted-foreground rounded-full px-2 py-0.5 font-mono text-xs tracking-wider"
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
            objectives={challenge.objectives ?? []}
          />
        </div>
      )}

      <div className="text-muted-foreground mt-3 text-xs">
        {t("reward")}: {t("xp", { amount: challenge.rewards.xpReward })}
        {challenge.rewards.badgeReward && ` + badge`}
        {challenge.rewards.sponsorReward && (
          <> &middot; {challenge.rewards.sponsorReward}</>
        )}
      </div>
    </div>
  );
}
