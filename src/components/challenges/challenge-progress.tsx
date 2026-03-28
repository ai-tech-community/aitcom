"use client";

import { api } from "@/trpc/react";
import {
  CheckIcon,
  ZapIcon,
  FlaskConicalIcon,
  FileCheckIcon,
  UsersIcon,
} from "lucide-react";

const verificationIcons: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
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
  const { data } = api.challenges.getProgress.useQuery({ challengeId });
  const { data: testResults } = api.challenges.getTestResults.useQuery({ challengeId });

  if (!data) return null;

  return (
    <div className="space-y-2">
      {objectives.map((objective, index) => {
        const progress = data.progress.find(
          (p) => p.objectiveIndex === index,
        );
        const current = progress?.currentCount ?? 0;
        const target = objective.targetCount;
        const isComplete =
          progress?.completedAt !== null &&
          progress?.completedAt !== undefined;
        const pct = Math.min(100, Math.round((current / target) * 100));

        const verification = objective.verification ?? progress?.verificationMode;
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
                    <VerificationIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  {objective.description}
                  {verification && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {verification}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  {latestTestResult && (
                    <span
                      className={`font-mono text-[10px] font-semibold ${
                        latestTestResult.passed
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      {latestTestResult.passed ? "PASS" : "FAIL"}
                    </span>
                  )}
                  {isPeerReview && (
                    <span
                      className={`font-mono text-[10px] ${
                        isReviewed
                          ? "font-semibold text-green-500"
                          : "text-muted-foreground"
                      }`}
                    >
                      {isReviewed ? "Reviewed" : "Pending review"}
                    </span>
                  )}
                  {current}/{target}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full transition-all ${isComplete ? "bg-green-500" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            {isComplete && (
              <CheckIcon className="h-4 w-4 shrink-0 text-green-500" />
            )}
          </div>
        );
      })}
    </div>
  );
}
