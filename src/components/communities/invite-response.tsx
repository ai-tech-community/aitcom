"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInviteResponse } from "./use-community-join";

/**
 * Accept / Decline for a direct invitation to a community.
 *
 * - `page` (the community page): the sentence "You're invited to join …"
 *   with Accept as the screen's primary action.
 * - `row` (a list such as My communities): the two buttons only, quiet, so
 *   a list of invitations is not a column of orange. `describedBy` points
 *   at the row's community name for screen readers.
 */
export function InviteResponse({
  slug,
  name,
  variant = "page",
  describedBy,
  onChange,
  className,
}: {
  slug: string;
  name?: string;
  variant?: "page" | "row";
  describedBy?: string;
  onChange?: () => void;
  className?: string;
}) {
  const t = useTranslations("communities.invite");
  const sentenceId = React.useId();
  const { accept, decline, busy } = useInviteResponse({
    slug,
    name,
    onChange,
  });
  const page = variant === "page";
  const describes = page ? sentenceId : describedBy;

  const buttons = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size={page ? "default" : "sm"}
        variant={page ? "default" : "secondary"}
        disabled={busy}
        aria-busy={busy || undefined}
        aria-describedby={describes}
        onClick={() => void accept()}
      >
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Check aria-hidden className="size-4" />
        )}
        {t("accept")}
      </Button>
      <Button
        type="button"
        size={page ? "default" : "sm"}
        variant="outline"
        disabled={busy}
        aria-describedby={describes}
        onClick={() => void decline()}
      >
        {t("decline")}
      </Button>
    </div>
  );

  if (!page) return <div className={className}>{buttons}</div>;

  return (
    <div
      data-slot="invite-response"
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
