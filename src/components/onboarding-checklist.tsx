"use client";

import { useEffect, useState } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Check, Circle, ExternalLink, Sparkles, X } from "lucide-react";
import { SectionLabel } from "@/components/ui/section-label";

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
      <div className="border-primary/30 bg-primary/5 relative rounded-lg border border-dashed px-4 py-5">
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground absolute top-2 right-2 rounded p-1 transition-colors"
          aria-label={t("dismiss")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-start gap-3">
          <Sparkles className="text-primary mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-sm font-medium">{t("welcomeCardTitle")}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("welcomeCardDescription")}
            </p>
            <Link
              href="/dashboard/onboarding"
              className="text-primary hover:text-primary/80 mt-3 inline-block font-mono text-xs tracking-wider"
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
    <div className="border-border bg-card rounded-lg border">
      <div className="border-border border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <SectionLabel bordered={false}>{t("checklistTitle")}</SectionLabel>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-[10px] tracking-wider">
              {completedCount}/{totalCount}
            </span>
            <button
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors"
              aria-label={t("dismiss")}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
        {/* Progress bar */}
        <div className="bg-secondary mt-2 h-1 rounded-full">
          <div
            className="bg-primary h-1 rounded-full transition-all"
            style={{ width: `${(completedCount / totalCount) * 100}%` }}
          />
        </div>
      </div>

      <ul className="divide-border divide-y">
        {checklist.map((step) => (
          <li key={step.slug} className="flex items-center gap-3 px-4 py-3">
            {step.completed ? (
              <Check className="text-primary h-4 w-4 shrink-0" />
            ) : (
              <Circle className="text-muted-foreground/40 h-4 w-4 shrink-0" />
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
                className="text-primary hover:text-primary/80 flex items-center gap-1 text-xs"
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
