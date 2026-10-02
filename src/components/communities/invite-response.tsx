"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInviteResponse, type InviteAnswer } from "./use-community-join";

export type InviteResponseVariant = "page" | "compact" | "row";

/**
 * Accept / Decline for a direct invitation to a community.
 *
 * - `page` (the community header): the sentence "You're invited to join …"
 *   above the buttons, Accept as the screen's primary action.
 * - `compact` (a tight header, e.g. the reels viewer): one line — a short
 *   "You're invited" and small buttons, Accept still primary.
 * - `row` (a list such as My communities): the two buttons only, quiet, so
 *   a list of invitations is not a column of orange. `describedBy` points
 *   at the row's community name for screen readers.
 *
 * Only the answer being sent shows a spinner and `aria-busy`; both buttons
 * are disabled meanwhile. `onAnswered` runs after a successful answer —
 * the place to refresh data and move focus, as this control goes away.
 */
export function InviteResponse({
  slug,
  name,
  variant = "page",
  describedBy,
  onAnswered,
  className,
}: {
  slug: string;
  name?: string;
  variant?: InviteResponseVariant;
  describedBy?: string;
  onAnswered?: (answer: InviteAnswer) => void;
  className?: string;
}) {
  const t = useTranslations("communities.invite");
  const sentenceId = React.useId();
  const { accept, decline, pending } = useInviteResponse({
    slug,
    name,
    onChange: onAnswered,
  });
  const describes = variant === "row" ? describedBy : sentenceId;
  const size = variant === "page" ? "default" : "sm";

  const spinnerOr = (answer: InviteAnswer, icon: React.ReactNode) =>
    pending === answer ? (
      <Loader2 aria-hidden className="size-4 animate-spin" />
    ) : (
      icon
    );

  const buttons = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size={size}
        variant={variant === "row" ? "secondary" : "default"}
        disabled={pending !== null}
        aria-busy={pending === "accept" || undefined}
        aria-describedby={describes}
        onClick={() => void accept()}
      >
        {spinnerOr("accept", <Check aria-hidden className="size-4" />)}
        {t("accept")}
      </Button>
      <Button
        type="button"
        size={size}
        variant="outline"
        disabled={pending !== null}
        aria-busy={pending === "decline" || undefined}
        aria-describedby={describes}
        onClick={() => void decline()}
      >
        {spinnerOr("decline", null)}
        {t("decline")}
      </Button>
    </div>
  );

  if (variant === "row") return <div className={className}>{buttons}</div>;

  if (variant === "compact") {
    return (
      <div
        data-slot="invite-response"
        data-variant="compact"
        className={cn("flex items-center gap-2", className)}
      >
        <span id={sentenceId} className="sr-only">
          {name
            ? t("invitedTitle", { community: name })
            : t("invitedTitleGeneric")}
        </span>
        <span aria-hidden className="text-sm font-medium whitespace-nowrap">
          {t("invitedShort")}
        </span>
        {buttons}
      </div>
    );
  }

  return (
    <div
      data-slot="invite-response"
      data-variant="page"
      className={cn("flex flex-col gap-2 sm:items-end", className)}
    >
      <p id={sentenceId} className="text-sm font-medium text-pretty">
        {name
          ? t("invitedTitle", { community: name })
          : t("invitedTitleGeneric")}
      </p>
      {buttons}
    </div>
  );
}
