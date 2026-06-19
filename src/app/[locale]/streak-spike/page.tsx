"use client";

/**
 * Trophy UI proof-of-fit spike (not for production). Composes the Trophy
 * Gamification UI Kit — re-tokenized onto the Town Square system — into one
 * dashboard, mirroring trophy.so's example. Lives on spike/trophy-ui only.
 * Wire to real XP/streak/leaderboard data via tRPC before any production use.
 */

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { SectionLabel } from "@/components/ui/section-label";
import { Button } from "@/components/ui/button";
import { PointsBadge } from "@/components/gamification/points-badge";
import { StreakCard } from "@/components/gamification/streak-card";
import { AchievementCard } from "@/components/gamification/achievement-card";
import { PointsChart } from "@/components/gamification/points-chart";
import { PointsLevelsList } from "@/components/gamification/points-levels-list";
import { PointsBoost } from "@/components/gamification/points-boost";
import { PointsAwards } from "@/components/gamification/points-awards";
import { LeaderboardRankings } from "@/components/gamification/leaderboard-rankings";
import { LeaderboardPodium } from "@/components/gamification/leaderboard-podium";
import { AchievementUnlocked } from "@/components/gamification/achievement-unlocked";
import { StreakCalendar } from "@/components/ui/streak-calendar";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inHours(h: number): string {
  const d = new Date();
  d.setHours(d.getHours() + h);
  return d.toISOString();
}

const STREAK = [
  { periodStart: daysAgo(11), periodEnd: daysAgo(0) },
  { periodStart: daysAgo(13), periodEnd: daysAgo(12), usedFreeze: true },
  { periodStart: daysAgo(40), periodEnd: daysAgo(15) },
];

const CHART_DATA = [
  { date: daysAgo(6), total: 120, change: 120 },
  { date: daysAgo(5), total: 210, change: 90 },
  { date: daysAgo(4), total: 320, change: 110 },
  { date: daysAgo(3), total: 540, change: 220 },
  { date: daysAgo(2), total: 640, change: 100 },
  { date: daysAgo(1), total: 650, change: 10 },
  { date: daysAgo(0), total: 720, change: 70 },
];
const CHART_LEVELS = [
  { value: 400, color: "var(--muted-foreground)" },
  { value: 1000, color: "var(--muted-foreground)" },
  { value: 1800, color: "var(--muted-foreground)" },
];

const LEVELS = [
  { id: "1", name: "Beginner", points: 0, iconType: "beginner" as const },
  { id: "2", name: "Novice", points: 500, iconType: "novice" as const },
  {
    id: "3",
    name: "Intermediate",
    points: 1000,
    iconType: "intermediate" as const,
  },
  {
    id: "4",
    name: "Professional",
    points: 1500,
    iconType: "professional" as const,
  },
  { id: "5", name: "Expert", points: 2000, iconType: "expert" as const },
  { id: "6", name: "Master", points: 2500, iconType: "master" as const },
  {
    id: "7",
    name: "Grand Master",
    points: 3000,
    iconType: "grand-master" as const,
  },
  {
    id: "8",
    name: "Enlightened",
    points: 3500,
    iconType: "enlightened" as const,
  },
];

const RANKINGS = [
  {
    userId: "u1",
    userName: "Ava Turner",
    rank: 1,
    value: 286900,
    byline: "Diamond",
    rankChange: 0,
  },
  {
    userId: "u2",
    userName: "Leo Harrison",
    rank: 2,
    value: 281400,
    byline: "Platinum",
    rankChange: 1,
  },
  {
    userId: "u3",
    userName: "Rowan Elijah",
    rank: 3,
    value: 274500,
    byline: "Platinum",
    rankChange: -1,
  },
  {
    userId: "u4",
    userName: "Mia Chen",
    rank: 4,
    value: 240100,
    byline: "Gold",
    rankChange: 2,
  },
  {
    userId: "me",
    userName: "Emma Johnson",
    rank: 5,
    value: 216700,
    byline: "Gold",
    rankChange: 0,
  },
];

const ACHIEVEMENTS = [
  {
    id: "a1",
    name: "First Steps",
    trigger: "metric" as const,
    progress: 100,
    achievedAt: daysAgo(20),
  },
  {
    id: "a2",
    name: "250 Tasks",
    trigger: "metric" as const,
    progress: 100,
    achievedAt: daysAgo(5),
  },
  {
    id: "a3",
    name: "1000 Tasks",
    trigger: "metric" as const,
    progress: 64,
    achievedAt: null,
  },
  {
    id: "a4",
    name: "Week Streak",
    trigger: "streak" as const,
    progress: 100,
    achievedAt: daysAgo(2),
  },
  {
    id: "a5",
    name: "Night Owl",
    trigger: "api" as const,
    progress: 30,
    achievedAt: null,
  },
  {
    id: "a6",
    name: "Mentor",
    trigger: "metric" as const,
    progress: 0,
    achievedAt: null,
  },
];

const AWARDS = [
  {
    id: "p1",
    awarded: 94,
    date: daysAgo(0),
    total: 2016,
    trigger: { id: "t1", type: "metric", points: 94, metricName: "Tasks" },
  },
  {
    id: "p2",
    awarded: 135,
    date: daysAgo(1),
    total: 1922,
    trigger: { id: "t2", type: "metric", points: 135, metricName: "Tasks" },
  },
  {
    id: "p3",
    awarded: 130,
    date: daysAgo(7),
    total: 1787,
    trigger: {
      id: "t3",
      type: "achievement",
      points: 130,
      achievementName: "Week Streak",
    },
  },
  {
    id: "p4",
    awarded: 71,
    date: daysAgo(28),
    total: 1657,
    trigger: { id: "t4", type: "streak", points: 71, streakLengthThreshold: 7 },
  },
];

const UNLOCKED = {
  id: "a4",
  name: "Week Streak",
  trigger: "streak" as const,
  description: "Stayed active seven days in a row. Consistency compounds.",
  unlockedAt: daysAgo(2),
};

export default function GamificationSpikePage() {
  const [unlockedOpen, setUnlockedOpen] = useState(false);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-12">
      <header className="space-y-2">
        <SectionLabel>Trophy UI spike</SectionLabel>
        <h1 className="text-2xl font-semibold tracking-tight">
          Gamification kit — re-tokenized
        </h1>
        <p className="text-muted-foreground max-w-prose text-sm">
          Trophy&apos;s example dashboard, rebuilt on Town Square tokens: orange
          stays rare (your level + the one CTA), achievements/streaks read as{" "}
          <span className="text-success font-medium">success</span>, tiers and
          medals are flattened to neutral, and stats speak Geist Mono.
        </p>
      </header>

      {/* Top grid: XP + chart + levels */}
      <section className="grid gap-4 lg:grid-cols-[260px_1fr_300px]">
        <div className="space-y-4">
          <PointsBadge name="XP" total={19845} icon={Sparkles} />
          <StreakCard
            streak={STREAK}
            currentStreak={12}
            longestStreak={26}
            total={216700}
            showHowItWorks={false}
          />
        </div>
        <div className="border-border bg-card rounded-xl border p-6">
          <PointsChart
            data={CHART_DATA}
            levels={CHART_LEVELS}
            title="Your points progress"
            height={300}
          />
        </div>
        <PointsLevelsList
          levels={LEVELS}
          currentPoints={1845}
          currentLevelLabel="You"
        />
      </section>

      {/* Boost banner */}
      <PointsBoost
        boost={{
          name: "Double XP Weekend",
          status: "active",
          multiplier: 2,
          description: "Enjoy double XP on all activity this weekend.",
          endDate: inHours(48),
        }}
        cta={{ text: "Do something", link: "#" }}
      />

      {/* Achievements + history */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <SectionLabel>Achievements</SectionLabel>
          <AchievementCard
            achievements={ACHIEVEMENTS}
            highlightedAchievements={ACHIEVEMENTS.slice(0, 3)}
          />
          <Button variant="outline" onClick={() => setUnlockedOpen(true)}>
            Preview &ldquo;unlocked&rdquo; dialog
          </Button>
        </div>
        <div className="space-y-4">
          <SectionLabel>Points history</SectionLabel>
          <PointsAwards awards={AWARDS} />
        </div>
      </section>

      {/* Leaderboard */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <SectionLabel>Leaderboard</SectionLabel>
          <LeaderboardRankings rankings={RANKINGS} currentUserId="me" />
        </div>
        <div className="space-y-4">
          <SectionLabel>Podium</SectionLabel>
          <div className="border-border bg-card rounded-xl border p-6">
            <LeaderboardPodium rankings={RANKINGS.slice(0, 3)} />
          </div>
        </div>
      </section>

      {/* Bonus: the streak calendar from the first pass */}
      <section className="space-y-4">
        <SectionLabel>Streak calendar</SectionLabel>
        <div className="border-border bg-card rounded-xl border p-6">
          <StreakCalendar streak={STREAK} view="year" startOfWeek={1} />
        </div>
      </section>

      <AchievementUnlocked
        achievement={UNLOCKED}
        open={unlockedOpen}
        onOpenChange={setUnlockedOpen}
      />
    </div>
  );
}
