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
import { useOnboardingDismissal } from "./use-onboarding-dismissal";

/**
 * Member settings: turn the getting-started checklist (dashboard card and
 * floating reminder) back on after "Don't show again", or off from here.
 * Reads the shared onboarding.getStatus cache, so the switch, the card and
 * the reminder always agree.
 */
export function ChecklistSetting() {
  const t = useTranslations("onboarding.setting");
  const status = api.onboarding.getStatus.useQuery();
  const { dismiss, restore, isPending } = useOnboardingDismissal();
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
            view={presentChecklistSetting(status.data)}
            pending={isPending}
            onChange={(on) => (on ? restore() : dismiss())}
          />
        )}
      </div>
    </section>
  );
}

function ChecklistSettingRow({
  view,
  pending,
  onChange,
}: {
  view: ChecklistSettingView;
  pending: boolean;
  onChange: (showing: boolean) => void;
}) {
  const t = useTranslations("onboarding.setting");
  const switchId = useId();
  const hintId = useId();
  const finished = view.kind === "finished";

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
          {finished ? t("finished") : t("hint")}
        </p>
      </div>
      <Switch
        id={switchId}
        aria-describedby={hintId}
        className="mt-0.5"
        checked={view.kind === "switch" && view.showing}
        disabled={finished || pending}
        onCheckedChange={onChange}
      />
    </div>
  );
}
