"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { ChallengeCard } from "./challenge-card";

export function ChallengeList() {
  const t = useTranslations("challenges");
  const [tab, setTab] = useState<"active" | "my">("active");

  const { data: challenges, isLoading } = api.challenges.list.useQuery();
  const { data: myEnrollments } = api.challenges.getMyEnrollments.useQuery();

  const enrolledIds = new Set(myEnrollments?.map((e) => e.challengeId) ?? []);

  const activeChallenges = (challenges ?? []).filter(
    (c) => c.status === "active",
  );

  return (
    <div>
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / CHALLENGES
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setTab("active")}
          className={`rounded-full px-3 py-1 font-mono text-xs tracking-wider transition-colors ${
            tab === "active"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("active")}
        </button>
        <button
          onClick={() => setTab("my")}
          className={`rounded-full px-3 py-1 font-mono text-xs tracking-wider transition-colors ${
            tab === "my"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("myChallenges")}
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading...
          </p>
        )}

        {!isLoading && activeChallenges.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )}

        {activeChallenges.map((challenge) => (
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
