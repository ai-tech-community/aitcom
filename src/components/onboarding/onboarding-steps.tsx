"use client";

import { ArrowRight, CheckCircle2, Circle, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { OnboardingStep } from "./checklist-view";

/**
 * Presentational pieces shared by the dashboard card and the floating
 * reminder panel. They take the controller's view data and callbacks; no
 * data fetching lives here.
 */

export function OnboardingProgress({
  completedCount,
  totalCount,
  percent,
  className,
}: {
  completedCount: number;
  totalCount: number;
  percent: number;
  className?: string;
}) {
  const t = useTranslations("onboarding");
  const label = t("progress", { done: completedCount, total: totalCount });
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Progress
        value={percent}
        aria-label={label}
        className="bg-secondary h-1 flex-1"
        // Neutral fill: progress is not an action, and the surfaces this sits
        // on keep their one Signal Orange for something else (One Voice Rule).
        indicatorClassName="bg-foreground motion-reduce:transition-none"
      />
      <span
        aria-hidden
        className="text-muted-foreground font-mono text-xs tracking-wider tabular-nums"
      >
        {completedCount}/{totalCount}
      </span>
    </div>
  );
}

export function OnboardingStepList({
  steps,
  onFollowStep,
}: {
  steps: OnboardingStep[];
  /** A member followed an open step's link. */
  onFollowStep: (stepSlug: string) => void;
}) {
  const t = useTranslations("onboarding");
  return (
    <ul className="divide-border divide-y">
      {steps.map((step) => {
        const label = t(`steps.${step.labelKey}`);
        if (step.completed) {
          return (
            <li
              key={step.slug}
              className="text-muted-foreground flex items-center gap-3 px-4 py-3 text-sm"
            >
              <CheckCircle2
                aria-hidden
                className="text-success h-4 w-4 shrink-0"
              />
              <span className="line-through">{label}</span>
              <span className="sr-only">({t("stepDone")})</span>
            </li>
          );
        }
        if (step.href) {
          return (
            <li key={step.slug}>
              <Link
                href={step.href}
                onClick={() => onFollowStep(step.slug)}
                className="hover:bg-secondary/50 focus-visible:ring-ring/50 group flex min-h-11 items-center gap-3 px-4 py-3 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-inset motion-reduce:transition-none"
              >
                <Circle
                  aria-hidden
                  className="text-muted-foreground h-4 w-4 shrink-0"
                />
                <span className="flex-1">{label}</span>
                <ArrowRight
                  aria-hidden
                  className="text-muted-foreground group-hover:text-foreground h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                />
              </Link>
            </li>
          );
        }
        return (
          <li
            key={step.slug}
            className="flex items-center gap-3 px-4 py-3 text-sm"
          >
            <Circle
              aria-hidden
              className="text-muted-foreground h-4 w-4 shrink-0"
            />
            <span>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Shown before the member has answered the "what brings you here" questions. */
export function OnboardingWelcome({ onFollow }: { onFollow?: () => void }) {
  const t = useTranslations("onboarding");
  return (
    <div className="flex items-start gap-3">
      <Sparkles
        aria-hidden
        className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
      />
      <div>
        <p className="text-sm font-medium">{t("welcomeCardTitle")}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("welcomeCardDescription")}
        </p>
        {/* Ink text and arrow: small orange text on white is ~3:1, and the
            dashboard side panel spends its one orange on the live XP boost
            (One Voice Rule). */}
        <Link
          href="/dashboard/onboarding"
          onClick={onFollow}
          className="text-foreground focus-visible:ring-ring/50 group mt-3 inline-flex min-h-6 items-center gap-1.5 rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
        >
          {t("welcomeCardCta")}
          <ArrowRight
            aria-hidden
            className="text-foreground h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
          />
        </Link>
      </div>
    </div>
  );
}
