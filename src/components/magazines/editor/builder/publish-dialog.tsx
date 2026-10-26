"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "@/i18n/navigation";
import type { IssueVisibility } from "@/lib/magazines/values";

import type { PublishBlocker } from "./items-model";

export type PublishDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What stops the publish now (`publishBlockers`); Publish waits for none. */
  blockers: PublishBlocker[];
  /** Who will be able to read the issue once it is out (its effective visibility). */
  audience: IssueVisibility;
  /**
   * Publishes the issue. Resolves once it is out; rejects when it is not, after
   * the builder has set `error`.
   */
  onConfirm: () => Promise<void>;
  /** Why the last attempt failed, in friendly words; null when it did not. */
  error: string | null;
  /** The issue's reading page, linked after a successful publish. */
  readingHref: string;
};

type Phase = "review" | "publishing" | "published";

/**
 * Publishing an issue is a checked moment: the editor sees what still blocks
 * it, reads in plain words who will be able to read it, confirms, and gets a
 * link to the reading page.
 */
export function PublishDialog({
  open,
  onOpenChange,
  blockers,
  audience,
  onConfirm,
  error,
  readingHref,
}: PublishDialogProps) {
  const t = useTranslations("magazineEditor.builder.publishDialog");
  const [phase, setPhase] = useState<Phase>("review");
  // The Publish button is gone once the issue is out: focus the next step.
  const readRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (phase === "published") readRef.current?.focus();
  }, [phase]);

  const blocked = blockers.length > 0;

  const changeOpen = (next: boolean) => {
    // A request in flight is not interrupted; its result decides.
    if (!next && phase === "publishing") return;
    if (!next) setPhase("review");
    onOpenChange(next);
  };

  const confirm = async () => {
    if (blocked || phase !== "review") return;
    setPhase("publishing");
    try {
      await onConfirm();
    } catch {
      setPhase("review");
      return;
    }
    setPhase("published");
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent showCloseButton={phase !== "publishing"}>
        {phase === "published" ? (
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
                {audience === "public"
                  ? t("audiencePublic")
                  : t("audienceMembers")}
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
                disabled={phase === "publishing"}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void confirm()}
                disabled={blocked || phase === "publishing"}
              >
                {phase === "publishing" ? t("publishing") : t("confirm")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
