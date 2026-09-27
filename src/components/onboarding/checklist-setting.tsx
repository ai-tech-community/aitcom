"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { ErrorState } from "@/components/ui/error-state";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "@/trpc/react";
import {
  presentChecklistSetting,
  type ChecklistSettingView,
} from "./checklist-setting-view";
import { clearHiddenForVisit, useHiddenForVisit } from "./use-hidden-for-visit";
import { useOnboardingDismissal } from "./use-onboarding-dismissal";

/**
 * Member settings: turn the getting-started checklist (dashboard card and
 * floating reminder) back on after "Don't show again" or "Hide until next
 * visit", or off from here. Reads the shared onboarding.getStatus cache and
 * the same visit flag as the reminder, so the switch, the card and the
 * reminder always agree.
 */
export function ChecklistSetting() {
  const t = useTranslations("onboarding.setting");
  const status = api.onboarding.getStatus.useQuery();
  const { dismiss, restore, isPending } = useOnboardingDismissal();
  const [hiddenForVisit] = useHiddenForVisit();
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <SectionLabel id={headingId}>{t("kicker")}</SectionLabel>
      <div className="mt-4">
        {status.isPending ? (
          <Skeleton className="h-[4.5rem] rounded" />
        ) : status.isError ? (
          <ErrorState
            className="border-border rounded border py-6"
            onRetry={() => void status.refetch()}
          />
        ) : (
          <ChecklistSettingRow
            view={presentChecklistSetting(status.data, { hiddenForVisit })}
            pending={isPending}
            onDismiss={dismiss}
            onRestore={restore}
            onUnhide={clearHiddenForVisit}
          />
        )}
      </div>
    </section>
  );
}

function ChecklistSettingRow({
  view,
  pending,
  onDismiss,
  onRestore,
  onUnhide,
}: {
  view: ChecklistSettingView;
  pending: boolean;
  onDismiss: () => void;
  onRestore: () => void;
  onUnhide: () => void;
}) {
  const t = useTranslations("onboarding.setting");
  const switchId = useId();
  const hintId = useId();
  const finished = view.kind === "finished";

  // While a save is in flight the switch stays enabled (disabling it would
  // drop keyboard and screen-reader focus to <body>); extra changes are
  // ignored instead and aria-busy tells assistive tech why.
  const onCheckedChange = (on: boolean) => {
    if (pending || view.kind !== "switch") return;
    if (!on) onDismiss();
    else if (view.turnOn === "unhide") onUnhide();
    else onRestore();
  };

  return (
    <div className="border-border flex items-start justify-between gap-4 rounded border px-3 py-3">
      <div className="min-w-0">
        <Label htmlFor={switchId} className="leading-snug text-balance">
          {t("label")}
        </Label>
        <p
          id={hintId}
          className="text-muted-foreground mt-1 max-w-prose text-xs leading-relaxed"
        >
          {finished
            ? t("finished")
            : view.hiddenForVisit
              ? t("hiddenForVisit")
              : t("hint")}
        </p>
      </div>
      <Switch
        id={switchId}
        aria-describedby={hintId}
        className="mt-0.5"
        checked={view.kind === "switch" && view.showing}
        aria-busy={pending || undefined}
        disabled={finished}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
