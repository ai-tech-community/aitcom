"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { ChallengeCard } from "./challenge-card";

const DIFFICULTIES = ["all", "beginner", "intermediate", "advanced", "expert"] as const;
const TYPES = ["all", "weekly", "monthly", "open-ended"] as const;

type DifficultyFilter = (typeof DIFFICULTIES)[number];
type TypeFilter = (typeof TYPES)[number];

export function ChallengeList() {
  const t = useTranslations("challenges");
  const [tab, setTab] = useState<"active" | "my">("active");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");

  const { data: challenges, isLoading } = api.challenges.list.useQuery({
    ...(difficulty !== "all" && { difficulty }),
    ...(type !== "all" && { type }),
  });
  const { data: myEnrollments } = api.challenges.getMyEnrollments.useQuery();

  const enrolledIds = new Set(myEnrollments?.map((e) => e.challengeId) ?? []);

  const activeChallenges = (challenges ?? []).filter(
    (c) => c.status === "active",
  );

  const displayedChallenges =
    tab === "my"
      ? activeChallenges.filter((c) => enrolledIds.has(c.id))
      : activeChallenges;

  const pillClass = (active: boolean) =>
    `rounded-full px-3 py-1 font-mono text-xs tracking-wider transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div>
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / CHALLENGES
        </span>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setTab("active")}
          className={pillClass(tab === "active")}
        >
          {t("active")}
        </button>
        <button
          onClick={() => setTab("my")}
          className={pillClass(tab === "my")}
        >
          {t("myChallenges")}
        </button>
      </div>

      {/* Difficulty filter */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Difficulty:
        </span>
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            onClick={() => setDifficulty(d)}
            className={pillClass(difficulty === d)}
          >
            {d === "all" ? "All" : d.charAt(0).toUpperCase() + d.slice(1)}
          </button>
        ))}
      </div>

      {/* Type filter */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Type:
        </span>
        {TYPES.map((tp) => (
          <button
            key={tp}
            onClick={() => setType(tp)}
            className={pillClass(type === tp)}
          >
            {tp === "all"
              ? "All"
              : tp === "open-ended"
                ? "Open-Ended"
                : tp.charAt(0).toUpperCase() + tp.slice(1)}
          </button>
        ))}
      </div>

      {/* Challenge list */}
      <div className="mt-4 space-y-4">
        {isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading...
          </p>
        )}

        {!isLoading && displayedChallenges.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )}

        {displayedChallenges.map((challenge) => (
          <ChallengeCard
            key={challenge.id}
            challenge={challenge}
            isEnrolled={enrolledIds.has(challenge.id)}
          />
        ))}
      </div>
    </div>
  );
}
