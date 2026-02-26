"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/server/better-auth/client";
import { ChallengeCard } from "./challenge-card";
import { SponsorChallengeForm } from "./sponsor-challenge-form";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const DIFFICULTIES = ["all", "beginner", "intermediate", "advanced", "expert"] as const;
const TYPES = ["all", "weekly", "monthly", "open-ended"] as const;

type DifficultyFilter = (typeof DIFFICULTIES)[number];
type TypeFilter = (typeof TYPES)[number];

export function ChallengeList() {
  const t = useTranslations("challenges");
  const tLanding = useTranslations("challengesLanding");
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  const [tab, setTab] = useState<"active" | "my">("active");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [showForm, setShowForm] = useState(false);

  const { data: challenges, isLoading } = api.challenges.list.useQuery({
    ...(difficulty !== "all" && { difficulty }),
    ...(type !== "all" && { type }),
  });

  const { data: myEnrollments } = api.challenges.getMyEnrollments.useQuery(
    undefined,
    { enabled: isAuthenticated },
  );

  const enrolledIds = new Set(myEnrollments?.map((e) => e.challengeId) ?? []);

  const activeChallenges = (challenges ?? []).filter(
    (c) => c.status === "active",
  );

  const displayedChallenges =
    tab === "my" && isAuthenticated
      ? activeChallenges.filter((c) => enrolledIds.has(c.id))
      : activeChallenges;

  const pillClass = (active: boolean) =>
    `rounded-full px-3 py-1 font-mono text-xs tracking-wider transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="px-6 py-8 sm:px-12 sm:py-16">
      {/* Hero */}
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("title").toUpperCase()}
        </span>
      </div>
      <div className="mt-8 max-w-2xl space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          {tLanding("headline")}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {tLanding("description")}
        </p>
      </div>

      {/* Tabs + Create (authenticated only) */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => setTab("active")}
            className={pillClass(tab === "active")}
          >
            {t("active")}
          </button>
          {isAuthenticated && (
            <button
              onClick={() => setTab("my")}
              className={pillClass(tab === "my")}
            >
              {t("myChallenges")}
            </button>
          )}
        </div>
        {isAuthenticated && !showForm && (
          <Button
            onClick={() => setShowForm(true)}
            className="font-mono text-xs tracking-wider"
            size="sm"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("propose")}
          </Button>
        )}
      </div>

      {/* Create Challenge Form */}
      {isAuthenticated && showForm && (
        <div className="mt-6">
          <SponsorChallengeForm
            onCancel={() => setShowForm(false)}
            onCreated={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground font-mono text-[11px] uppercase tracking-wider">
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
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground font-mono text-[11px] uppercase tracking-wider">
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

      {/* Challenge Cards */}
      <div className="mt-6 space-y-4">
        {isLoading && (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Loading...
          </p>
        )}

        {!isLoading && displayedChallenges.length === 0 && (
          <p className="text-muted-foreground py-8 text-center text-sm">
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

      {/* Sign up CTA for visitors */}
      {!isAuthenticated && (
        <div className="mt-12 text-center">
          <p className="text-muted-foreground mb-4 text-sm">
            Sign up to join challenges, track progress, and earn rewards.
          </p>
          <Link
            href="/auth/signup"
            className="bg-foreground text-background inline-block rounded px-6 py-2.5 font-mono text-xs font-semibold tracking-wider transition-opacity hover:opacity-80"
          >
            JOIN →
          </Link>
        </div>
      )}
    </div>
  );
}
