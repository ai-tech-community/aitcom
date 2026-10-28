"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import {
  browserTimeZone,
  isoToLocalDateTime,
  localDateTimeToIso,
  scheduleProblem,
} from "@/lib/magazines/schedule";
import type { IssueVisibility } from "@/lib/magazines/values";

import { editorErrorKey } from "../editor-errors";
import { useScheduleTime } from "../use-schedule-time";
import type { PublishBlocker } from "./items-model";

export type PublishDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What stops the publish now (`publishBlockers`); Publish waits for none. */
  blockers: PublishBlocker[];
  /** Saved unavailable markers that readers will skip; these never block Publish. */
  skippedCount: number;
  /** Who will be able to read the issue once it is out (its effective visibility). */
  audience: IssueVisibility;
  /**
   * Publishes the issue. Resolves once it is out; rejects when it is not, after
   * the builder has set `error`.
   */
  onConfirm: () => Promise<void>;
  /** The issue's current schedule (ISO), or null. */
  scheduledFor: string | null;
  /** Resolves when stored; rejects after the builder sets its error. */
  onSchedule: (publishAt: string) => Promise<void>;
  /** Stops the schedule, with the same error contract. */
  onUnschedule: () => Promise<void>;
  /** Why the last attempt failed, in friendly words; null when it did not. */
  error: string | null;
  /** The issue's reading page, linked after a successful publish. */
  readingHref: string;
};

type Phase = "review" | "working" | "published" | "scheduled" | "unscheduled";

const AUDIENCE_COPY = {
  members: "audienceMembers",
  teaser: "audienceTeaser",
  public: "audiencePublic",
} as const satisfies Record<IssueVisibility, string>;

/**
 * Publishing an issue is a checked moment: the editor sees what still blocks
 * it, reads in plain words who will be able to read it, confirms, and gets a
 * link to the reading page.
 */
export function PublishDialog({
  open,
  onOpenChange,
  blockers,
  skippedCount,
  audience,
  onConfirm,
  scheduledFor,
  onSchedule,
  onUnschedule,
  error,
  readingHref,
}: PublishDialogProps) {
  const t = useTranslations("magazineEditor.builder.publishDialog");
  const tPublish = useTranslations("magazineEditor.builder.publish");
  const tErrors = useTranslations("magazineEditor.errors");
  const displayTime = useScheduleTime();
  const id = useId();
  const timeId = `${id}-time`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const [phase, setPhase] = useState<Phase>("review");
  const [when, setWhen] = useState<"now" | "later">(
    scheduledFor ? "later" : "now",
  );
  const [localTime, setLocalTime] = useState(
    scheduledFor ? isoToLocalDateTime(scheduledFor) : "",
  );
  const [timeError, setTimeError] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    setWhen(scheduledFor ? "later" : "now");
    setLocalTime(scheduledFor ? isoToLocalDateTime(scheduledFor) : "");
    setTimeError(null);
  }, [open, scheduledFor]);
  // The Publish button is gone once the issue is out: focus the next step.
  const readRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (phase === "published") readRef.current?.focus();
    else if (phase === "scheduled" || phase === "unscheduled")
      keepEditingRef.current?.focus();
  }, [phase]);

  const blocked = blockers.length > 0;

  const changeOpen = (next: boolean) => {
    // A request in flight is not interrupted; its result decides.
    if (!next && phase === "working") return;
    if (!next) setPhase("review");
    onOpenChange(next);
  };

  const perform = async (action: () => Promise<void>, success: Phase) => {
    if (phase !== "review") return;
    setPhase("working");
    try {
      await action();
    } catch {
      setPhase("review");
      return;
    }
    setPhase(success);
  };

  const confirm = async () => {
    if (blocked || phase !== "review") return;
    if (when === "now") return perform(onConfirm, "published");
    const iso = localDateTimeToIso(localTime);
    if (!iso) {
      setTimeError(t("timeInvalid"));
      return;
    }
    const problem = scheduleProblem(new Date(iso), new Date());
    if (problem) {
      setTimeError(tErrors(editorErrorKey(problem)));
      return;
    }
    setTimeError(null);
    await perform(async () => {
      await onSchedule(iso);
      setScheduledAt(iso);
    }, "scheduled");
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent showCloseButton={phase !== "working"}>
        {phase === "scheduled" || phase === "unscheduled" ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {t(
                  phase === "scheduled" ? "scheduledTitle" : "unscheduledTitle",
                )}
              </DialogTitle>
              <DialogDescription role="status">
                {phase === "scheduled" && scheduledAt
                  ? t("scheduledLead", { time: displayTime(scheduledAt) })
                  : t("unscheduledLead")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                ref={keepEditingRef}
                type="button"
                variant="outline"
                onClick={() => changeOpen(false)}
              >
                {t("keepEditing")}
              </Button>
            </DialogFooter>
          </>
        ) : phase === "published" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("successTitle")}</DialogTitle>
              <DialogDescription>{t("successLead")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => changeOpen(false)}
              >
                {t("keepEditing")}
              </Button>
              {/* Orange belongs to Publish alone (One Voice Rule). */}
              <Button asChild variant="secondary">
                <Link ref={readRef} href={readingHref}>
                  {t("read")}
                </Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>
                {t(AUDIENCE_COPY[audience])}
              </DialogDescription>
            </DialogHeader>

            {blocked ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">{t("blockersTitle")}</p>
                <ul className="divide-border divide-y rounded-md border">
                  {blockers.map((blocker) => (
                    <li
                      key={blocker}
                      className="flex items-start gap-2 px-3 py-2.5 text-sm"
                    >
                      <CircleAlert
                        className="text-destructive mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                      />
                      {t(`blocker.${blocker}`)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm">
                <CircleCheck
                  className="text-success size-4 shrink-0"
                  aria-hidden="true"
                />
                {t("ready")}
              </p>
            )}

            {skippedCount > 0 && (
              <p className="text-muted-foreground text-sm">
                {tPublish("skipped", { count: skippedCount })}
              </p>
            )}

            <fieldset
              disabled={phase === "working"}
              className="flex min-w-0 flex-col gap-3"
            >
              <legend className="mb-3 text-sm font-medium">{t("when")}</legend>
              {(["now", "later"] as const).map((choice) => (
                <label key={choice} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${id}-when`}
                    value={choice}
                    checked={when === choice}
                    onChange={() => {
                      setWhen(choice);
                      setTimeError(null);
                    }}
                    className="accent-foreground focus-visible:ring-ring/50 size-4 shrink-0 outline-none focus-visible:ring-[3px]"
                  />
                  {t(choice)}
                </label>
              ))}
              {when === "later" && (
                <div className="flex min-w-0 flex-col gap-2">
                  <label htmlFor={timeId} className="text-sm font-medium">
                    {t("timeLabel")}
                  </label>
                  <Input
                    id={timeId}
                    type="datetime-local"
                    value={localTime}
                    onChange={(event) => {
                      setLocalTime(event.target.value);
                      setTimeError(null);
                    }}
                    aria-describedby={
                      timeError ? `${helpId} ${errorId}` : helpId
                    }
                    aria-invalid={timeError ? true : undefined}
                    className="min-w-0"
                  />
                  <p id={helpId} className="text-muted-foreground text-sm">
                    {t("timeHelp", { zone: browserTimeZone() })}
                  </p>
                  {timeError && (
                    <p
                      id={errorId}
                      role="alert"
                      className="text-destructive text-sm"
                    >
                      {timeError}
                    </p>
                  )}
                </div>
              )}
            </fieldset>

            {scheduledFor && (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-muted-foreground text-sm">
                  {t("currentSchedule", { time: displayTime(scheduledFor) })}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={phase === "working"}
                  onClick={() => void perform(onUnschedule, "unscheduled")}
                >
                  {t("unschedule")}
                </Button>
              </div>
            )}

            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => changeOpen(false)}
                disabled={phase === "working"}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void confirm()}
                disabled={blocked || phase === "working"}
              >
                {phase === "working"
                  ? t(when === "later" ? "scheduling" : "publishing")
                  : t(when === "later" ? "scheduleConfirm" : "confirm")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
