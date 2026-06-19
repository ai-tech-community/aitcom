"use client";

/**
 * Trophy UI proof-of-fit spike (not for production). Demonstrates the
 * re-tokenized <StreakCalendar> rendering inside the Town Square system.
 * Lives on the spike/trophy-ui branch only.
 */

import { SectionLabel } from "@/components/ui/section-label";
import {
  StreakCalendar,
  type StreakPeriod,
} from "@/components/ui/streak-calendar";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Sample data: a current run, a freeze, and an older streak — wire this to real
// activity/XP data via tRPC in production.
const SAMPLE_STREAK: StreakPeriod[] = [
  { periodStart: daysAgo(6), periodEnd: daysAgo(0) },
  { periodStart: daysAgo(8), periodEnd: daysAgo(7), usedFreeze: true },
  { periodStart: daysAgo(40), periodEnd: daysAgo(12) },
  { periodStart: daysAgo(120), periodEnd: daysAgo(60) },
];

export default function StreakSpikePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-12">
      <header className="space-y-2">
        <SectionLabel>Trophy UI spike</SectionLabel>
        <h1 className="text-2xl font-semibold tracking-tight">
          Streak Calendar — re-tokenized
        </h1>
        <p className="text-muted-foreground max-w-prose text-sm">
          Pulled from Trophy&apos;s open-source Gamification UI Kit and rebuilt
          on the Town Square tokens: active days are{" "}
          <span className="text-success font-medium">success</span>, today is
          the single Signal-Orange focus, freezes are{" "}
          <span className="text-info font-medium">info</span>, labels speak the
          Geist Mono machine voice.
        </p>
      </header>

      <section className="space-y-4">
        <SectionLabel>This week</SectionLabel>
        <div className="border-border bg-card rounded-xl border p-6">
          <StreakCalendar streak={SAMPLE_STREAK} view="week" startOfWeek={1} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionLabel>This month</SectionLabel>
        <div className="border-border bg-card rounded-xl border p-6">
          <StreakCalendar streak={SAMPLE_STREAK} view="month" startOfWeek={1} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionLabel>Last 365 days</SectionLabel>
        <div className="border-border bg-card rounded-xl border p-6">
          <StreakCalendar streak={SAMPLE_STREAK} view="year" startOfWeek={1} />
        </div>
      </section>
    </div>
  );
}
