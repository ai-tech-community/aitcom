"use client";

import { api } from "@/trpc/react";
import { CheckIcon } from "lucide-react";

interface ChallengeProgressProps {
  challengeId: number;
  objectives: { description: string; action: string; targetCount: number }[];
}

export function ChallengeProgress({
  challengeId,
  objectives,
}: ChallengeProgressProps) {
  const { data } = api.challenges.getProgress.useQuery({ challengeId });

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

        return (
          <div key={index} className="flex items-center gap-2">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs">
                <span
                  className={
                    isComplete
                      ? "text-foreground line-through"
                      : "text-foreground"
                  }
                >
                  {objective.description}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
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
