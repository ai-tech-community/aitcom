"use client";

import { useEffect, useState } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Check, Circle, ExternalLink, Sparkles, X } from "lucide-react";

const DISMISS_KEY = "onboarding-dismissed";

export function OnboardingChecklist() {
  const t = useTranslations("onboarding");
  const utils = api.useUtils();

  const [dismissed, setDismissed] = useState(true); // default hidden until hydrated

  const { data, isLoading } = api.onboarding.getStatus.useQuery();
  const syncMutation = api.onboarding.syncAutoDetected.useMutation({
    onSuccess: () => void utils.onboarding.getStatus.invalidate(),
  });
  const completeMutation = api.onboarding.completeStep.useMutation({
    onSuccess: () => void utils.onboarding.getStatus.invalidate(),
  });

  // Hydrate dismissed state from localStorage
  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "true");
  }, []);

  // Sync auto-detected steps on mount
  useEffect(() => {
    if (data?.hasProfile && !data.onboardingCompleted) {
      syncMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.hasProfile, data?.onboardingCompleted]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  };

  if (isLoading || dismissed) return null;
  if (data?.onboardingCompleted) return null;

  // User hasn't taken the onboarding quiz yet - show soft welcome card
  if (!data?.hasIntent) {
    return (
      <div className="relative rounded-lg border border-dashed border-primary/30 bg-primary/5 px-4 py-5">
        <button
          onClick={handleDismiss}
          className="absolute right-2 top-2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={t("dismiss")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">{t("welcomeCardTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("welcomeCardDescription")}
            </p>
            <Link
              href="/dashboard/onboarding"
              className="mt-3 inline-block font-mono text-xs tracking-wider text-primary hover:text-primary/80"
            >
              {t("welcomeCardCta")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // User has intent - show progress checklist
  const checklist = data.checklist;
  const completedCount = checklist.filter((s) => s.completed).length;
  const totalCount = checklist.length;

  if (totalCount === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / {t("checklistTitle")}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
              {completedCount}/{totalCount}
            </span>
            <button
              onClick={handleDismiss}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t("dismiss")}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1 rounded-full bg-secondary">
          <div
            className="h-1 rounded-full bg-primary transition-all"
            style={{ width: `${(completedCount / totalCount) * 100}%` }}
          />
        </div>
      </div>

      <ul className="divide-y divide-border">
        {checklist.map((step) => (
          <li key={step.slug} className="flex items-center gap-3 px-4 py-3">
            {step.completed ? (
              <Check className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
            )}

            <span
              className={`flex-1 text-sm ${
                step.completed
                  ? "text-muted-foreground line-through"
                  : "text-foreground"
              }`}
            >
              {t(`steps.${step.labelKey}`)}
            </span>

            {!step.completed && step.href && (
              <Link
                href={step.href}
                onClick={() => {
                  completeMutation.mutate({ stepSlug: step.slug });
                }}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
              >
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
