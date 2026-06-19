"use client";

import { api } from "@/trpc/react";
import {
  CheckIcon,
  ZapIcon,
  FlaskConicalIcon,
  FileCheckIcon,
  UsersIcon,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

const verificationIcons: Record<
  string,
  React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
  "platform-action": ZapIcon,
  test: FlaskConicalIcon,
  "self-report": FileCheckIcon,
  "peer-review": UsersIcon,
};

interface ChallengeProgressProps {
  challengeId: number;
  objectives: {
    description: string;
    action?: string | null;
    targetCount: number;
    verification?: string;
  }[];
}

export function ChallengeProgress({
  challengeId,
  objectives,
}: ChallengeProgressProps) {
  const { data, isLoading, isError, refetch } =
    api.challenges.getProgress.useQuery({ challengeId });
  const { data: testResults } = api.challenges.getTestResults.useQuery({
    challengeId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-1.5 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-muted-foreground font-mono text-xs">
        Couldn&apos;t load progress.{" "}
        <button
          onClick={() => refetch()}
          className="text-foreground underline underline-offset-2"
        >
          Retry
        </button>
      </p>
    );
  }

  if (!data) return null;

  if (objectives.length === 0) {
    return (
      <p className="text-muted-foreground font-mono text-xs tracking-wider">
        This challenge has no individual objectives. For hackathons, your work
        lives in the team workspace.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {objectives.map((objective, index) => {
        const progress = data.progress.find((p) => p.objectiveIndex === index);
        const current = progress?.currentCount ?? 0;
        const target = objective.targetCount;
        const isComplete =
          progress?.completedAt !== null && progress?.completedAt !== undefined;
        const pct = Math.min(100, Math.round((current / target) * 100));

        const verification =
          objective.verification ?? progress?.verificationMode;
        const VerificationIcon = verification
          ? verificationIcons[verification]
          : undefined;

        // For test objectives, find the latest test result
        const latestTestResult =
          verification === "test" && testResults
            ? testResults
                .filter((r) => r.objectiveIndex === index)
                .sort(
                  (a, b) =>
                    new Date(b.reportedAt).getTime() -
                    new Date(a.reportedAt).getTime(),
                )[0]
            : undefined;

        // For peer-review objectives, check review status
        const isPeerReview = verification === "peer-review";
        const isReviewed = isPeerReview && progress?.reviewedBy;

        return (
          <div key={objective.description} className="flex items-center gap-2">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs">
                <span
                  className={`flex items-center gap-1 ${
                    isComplete
                      ? "text-foreground line-through"
                      : "text-foreground"
                  }`}
                >
                  {VerificationIcon && (
                    <VerificationIcon className="text-muted-foreground h-3 w-3 shrink-0" />
                  )}
                  {objective.description}
                  {verification && (
                    <span className="text-muted-foreground font-mono text-xs">
                      {verification}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
                  {latestTestResult && (
                    <span
                      className={`font-mono text-xs font-semibold ${
                        latestTestResult.passed
                          ? "text-success"
                          : "text-destructive"
                      }`}
                    >
                      {latestTestResult.passed ? "PASS" : "FAIL"}
                    </span>
                  )}
                  {isPeerReview && (
                    <span
                      className={`font-mono text-xs ${
                        isReviewed
                          ? "text-success font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {isReviewed ? "Reviewed" : "Pending review"}
                    </span>
                  )}
                  {current}/{target}
                </span>
              </div>
              <Progress
                value={pct}
                className="bg-secondary mt-1 h-1.5"
                indicatorClassName={isComplete ? "bg-success" : undefined}
              />
            </div>
            {isComplete && (
              <CheckIcon className="text-success h-4 w-4 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}
