"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { focusDockHome } from "@/components/inbox/corner-dock";
import type { OnboardingChecklistView } from "./checklist-view";
import {
  OnboardingProgress,
  OnboardingStepList,
  OnboardingWelcome,
} from "./onboarding-steps";
import { isReminderRoute, shouldShowReminder } from "./reminder-visibility";
import { useHiddenForVisit } from "./use-hidden-for-visit";
import { useOnboardingChecklist } from "./use-onboarding-checklist";

/**
 * Site-wide "Getting started · 2/5" pill for signed-in members. Sits in the
 * bottom-right dock next to the inbox pill (InboxRoot renders it through its
 * `dockLeading` slot), opens a non-modal panel with the same checklist as the
 * dashboard card, and never opens by itself.
 */
export function OnboardingReminder() {
  const pathname = usePathname();
  const onRoute = isReminderRoute(pathname);
  const { view, completeStep, dismiss } = useOnboardingChecklist({
    // Off-route pages (dashboard) render their own checklist and sync there.
    sync: onRoute ? "on-finish" : "off",
  });
  const [hiddenForVisit, hideForVisit] = useHiddenForVisit();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const t = useTranslations("onboarding.reminder");

  if (!shouldShowReminder({ pathname, view, hiddenForVisit })) return null;

  const close = () => setOpen(false);
  // The pill is about to unmount while it (or its panel) holds focus. Hand
  // focus to a stable control first so it does not fall to <body>.
  const hideAnd = (hide: () => void) => () => {
    focusDockHome();
    close();
    hide();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="border-border bg-background hover:bg-secondary data-[state=open]:bg-secondary focus-visible:ring-ring/50 flex items-center gap-2 rounded-lg border px-3 py-2.5 shadow-lg transition-colors outline-none focus-visible:ring-[3px] motion-reduce:transition-none sm:px-4"
        >
          <PillLabel view={view} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        aria-labelledby={titleId}
        className="w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl p-0 motion-reduce:animate-none"
      >
        <div className="border-border border-b px-4 pt-3 pb-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-sm font-semibold">
              {t("title")}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={t("close")}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -mr-1 rounded p-1 transition-colors outline-none focus-visible:ring-[3px] motion-reduce:transition-none"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
          {view.kind === "checklist" ? (
            <>
              <p className="text-muted-foreground mt-1 text-sm">{t("intro")}</p>
              <OnboardingProgress
                completedCount={view.completedCount}
                totalCount={view.totalCount}
                percent={view.percent}
                className="mt-3"
              />
            </>
          ) : null}
        </div>

        {view.kind === "checklist" ? (
          <OnboardingStepList
            steps={view.steps}
            onFollowStep={(slug) => {
              completeStep(slug);
              close();
            }}
          />
        ) : (
          <div className="px-4 py-4">
            <OnboardingWelcome onFollow={close} />
          </div>
        )}

        <div className="border-border flex flex-wrap justify-end gap-1 border-t px-2 py-2">
          <Button variant="ghost" size="sm" onClick={hideAnd(hideForVisit)}>
            {t("hideForNow")}
          </Button>
          <Button variant="ghost" size="sm" onClick={hideAnd(dismiss)}>
            {t("dontShowAgain")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PillLabel({ view }: { view: OnboardingChecklistView }) {
  const t = useTranslations("onboarding.reminder");
  return (
    <>
      {view.kind === "checklist" ? (
        <span aria-hidden className="flex items-center gap-0.5">
          {view.steps.map((step) => (
            <span
              key={step.slug}
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                step.completed ? "bg-foreground" : "bg-muted-foreground/35",
              )}
            />
          ))}
        </span>
      ) : null}
      {/* Small screens: dots + count only, so the dock row fits at 320px
          (WCAG 1.4.10). The label stays as sr-only text, so the accessible
          name does not change. The welcome state has no count to show, so it
          keeps its label. */}
      <span
        className={cn(
          "text-muted-foreground font-mono text-xs font-medium tracking-wider whitespace-nowrap uppercase",
          view.kind === "checklist" && "max-sm:sr-only",
        )}
      >
        {t("pill")}
      </span>
      {view.kind === "checklist" ? (
        <>
          <span
            aria-hidden
            className="text-foreground font-mono text-xs font-medium tabular-nums"
          >
            {view.completedCount}/{view.totalCount}
          </span>
          {/* Space text node: sibling spans otherwise join with no gap in
              the computed accessible name ("started2 of 5"). */}{" "}
          <span className="sr-only">
            {t("pillProgress", {
              done: view.completedCount,
              total: view.totalCount,
            })}
          </span>
        </>
      ) : null}
    </>
  );
}
