"use client";

import { useTranslations } from "next-intl";
import type { Ref } from "react";

import { Button } from "@/components/ui/button";
import type { IssueStatus, ScheduleOrigin } from "@/lib/magazines/values";

import { useScheduleTime } from "../use-schedule-time";

/** Where this draft came from, and whether it will publish without an editor. */
export function AutoDraftNotice({
  status,
  scheduledVia,
  scheduledFor,
  onStop,
  stopping,
  ref,
}: {
  status: IssueStatus;
  scheduledVia: ScheduleOrigin | null;
  scheduledFor: string | null;
  onStop: () => void;
  stopping: boolean;
  /** Stable focus destination after the Stop button disappears. */
  ref?: Ref<HTMLElement>;
}) {
  const t = useTranslations("magazineEditor.builder.autoDraft");
  const displayTime = useScheduleTime();
  const automatic =
    status === "scheduled" && scheduledVia === "auto" && scheduledFor;

  return (
    <section
      ref={ref}
      role="region"
      aria-label={t("label")}
      tabIndex={-1}
      className="focus-visible:ring-ring/50 flex min-w-0 flex-col items-start gap-3 rounded-md border p-3 text-sm outline-none focus-visible:ring-[3px]"
    >
      <p>
        {automatic
          ? t.rich("scheduled", {
              time: displayTime(scheduledFor),
              timestamp: (chunks) => (
                <span className="font-mono">{chunks}</span>
              ),
            })
          : t("draft")}
      </p>
      {automatic && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-auto min-h-8 max-w-full whitespace-normal"
          onClick={onStop}
          disabled={stopping}
        >
          {t("stop")}
        </Button>
      )}
    </section>
  );
}
