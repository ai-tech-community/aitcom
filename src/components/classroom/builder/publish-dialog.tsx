"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  PartyPopper,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { fireConfetti } from "@/components/classroom/celebrate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  canPublish,
  publishChecks,
  type CheckResult,
  type ChecklistInput,
} from "@/lib/classroom/publish-checklist";

export type PublishDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The saved course as it would go live; lesson and module titles come from here. */
  input: ChecklistInput;
  /** Close the dialog and open this lesson in the builder. */
  onGoToLesson: (lessonId: number) => void;
  /** Close the dialog and show the outline (modules are fixed there). */
  onGoToOutline: () => void;
  /**
   * Performs the publish. Resolves once the course is live; rejects when it is
   * not. The caller reports the failure (toast or conflict banner) and decides
   * whether the dialog stays open.
   */
  onConfirm: () => Promise<void>;
  /** Where "View course" goes after a successful publish. */
  courseHref: string;
};

type Phase = "review" | "publishing" | "live";

/**
 * Publishing is a deliberate, checked moment: the author sees what we checked,
 * fixes anything that blocks, confirms, and gets a small celebration.
 */
export function PublishDialog({
  open,
  onOpenChange,
  input,
  onGoToLesson,
  onGoToOutline,
  onConfirm,
  courseHref,
}: PublishDialogProps) {
  const t = useTranslations("classroomBuilder");
  const [phase, setPhase] = useState<Phase>("review");
  // The Publish button that had focus is gone once live: hand focus to the
  // next step so keyboard and screen-reader users land on the success state.
  const viewCourseRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (phase === "live") viewCourseRef.current?.focus();
  }, [phase]);
  const checks = useMemo(() => publishChecks(input), [input]);
  const ready = canPublish(checks);

  const changeOpen = (next: boolean) => {
    // Nothing may interrupt a request in flight; the result decides.
    if (!next && phase === "publishing") return;
    if (!next) setPhase("review");
    onOpenChange(next);
  };

  const confirm = async () => {
    if (!ready || phase !== "review") return;
    setPhase("publishing");
    try {
      await onConfirm();
    } catch {
      // The builder already told the author what went wrong.
      setPhase("review");
      return;
    }
    setPhase("live");
    fireConfetti();
  };

  const leaveTo = (go: () => void) => {
    changeOpen(false);
    go();
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent showCloseButton={phase !== "publishing"}>
        {phase === "live" ? (
          <>
            <DialogHeader>
              <PartyPopper
                className="text-muted-foreground size-6"
                aria-hidden="true"
              />
              <DialogTitle>{t("publishSuccess")}</DialogTitle>
              <DialogDescription>{t("publishSuccessLead")}</DialogDescription>
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
                <Link ref={viewCourseRef} href={courseHref as never}>
                  {t("viewCourse")}
                </Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("publishTitle")}</DialogTitle>
              <DialogDescription>{t("publishLead")}</DialogDescription>
            </DialogHeader>
            <ul className="border-border divide-border divide-y rounded-md border">
              {checks.map((check) => (
                <CheckRow
                  key={check.id}
                  check={check}
                  input={input}
                  onLesson={(id) => leaveTo(() => onGoToLesson(id))}
                  onModule={() => leaveTo(onGoToOutline)}
                />
              ))}
            </ul>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => changeOpen(false)}
                disabled={phase === "publishing"}
              >
                {t("notYet")}
              </Button>
              <Button
                type="button"
                onClick={() => void confirm()}
                disabled={!ready || phase === "publishing"}
              >
                {phase === "publishing" ? t("publishing") : t("publish")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CheckRow({
  check,
  input,
  onLesson,
  onModule,
}: {
  check: CheckResult;
  input: ChecklistInput;
  onLesson: (lessonId: number) => void;
  onModule: () => void;
}) {
  const t = useTranslations("classroomBuilder");
  const fixId = useId();
  const blocking = !check.ok && check.level === "block";

  // Every state carries an icon AND a screen-reader word, never colour alone.
  const [Icon, iconClass, stateLabel] = check.ok
    ? ([CircleCheck, "text-success", t("checkPassed")] as const)
    : blocking
      ? ([CircleAlert, "text-destructive", t("checkFailed")] as const)
      : ([CircleDashed, "text-muted-foreground", t("checkOptional")] as const);

  const lessons = blocking
    ? input.lessons.filter((l) => check.lessonIds?.includes(l.id))
    : [];
  const modules = blocking
    ? input.modules.filter((m) => check.moduleIds?.includes(m.id))
    : [];
  const targets = [
    ...lessons.map((l) => ({
      key: `lesson-${l.id}`,
      title: l.title,
      go: () => onLesson(l.id),
    })),
    ...modules.map((m) => ({
      key: `module-${m.id}`,
      title: m.title,
      go: onModule,
    })),
  ];

  return (
    <li className="flex gap-3 px-3 py-2.5 text-sm">
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", iconClass)}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className={check.ok ? "text-muted-foreground" : undefined}>
          <span className="sr-only">{stateLabel}: </span>
          {t(`check_${check.id}`)}
        </p>
        {targets.length > 0 ? (
          <div className="mt-1.5">
            <p id={fixId} className="text-muted-foreground text-xs">
              {t("checkFixHint")}
            </p>
            <ul aria-labelledby={fixId} className="mt-1 flex flex-wrap gap-1.5">
              {targets.map((target) => (
                <li key={target.key}>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="max-w-60"
                    onClick={target.go}
                  >
                    <span className="truncate">{target.title}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </li>
  );
}
