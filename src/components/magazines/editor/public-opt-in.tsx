"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import type { IssueVisibility } from "@/lib/magazines/values";
import type { CommunityVisibility } from "@/server/communities/content-visibility";
import {
  planVisibilityChange,
  type VisibilityRecord,
} from "@/server/magazines/visibility-change";

/**
 * Whether saving `next` needs the editor's opt-in, by the same rule the
 * server applies (`planVisibilityChange`): only `public` in a
 * content-private community whose saved record holds no confirmation yet.
 *
 * A dry run without confirmation: such a run either refuses or returns a
 * record that never names the actor, so the actor and clock it is given
 * do not matter.
 */
export function publicOptInRequired(input: {
  next: IssueVisibility;
  saved: VisibilityRecord;
  community: CommunityVisibility;
}): boolean {
  const plan = planVisibilityChange({
    next: input.next,
    current: input.saved,
    community: input.community,
    confirmUnlistedPublic: false,
    actorId: "",
    now: new Date(0),
  });
  return !plan.ok;
}

/**
 * The unlisted-community opt-in (ADR-0042): before a private community shows
 * an issue (or its magazine default) to everyone, the editor reads in plain
 * words what becomes visible and ticks a box. Renders nothing unless
 * `value` is `public` and the community is private. The parent blocks its
 * save until `confirmed` and sends `confirmUnlistedPublic` only then. Used by
 * the magazine settings (default visibility) and the issue builder.
 */
export function PublicOptIn({
  communityIsPrivate,
  value,
  confirmed,
  onConfirmedChange,
}: {
  communityIsPrivate: boolean;
  value: IssueVisibility;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
}) {
  const t = useTranslations("magazineEditor.publicOptIn");
  const warningId = useId();
  const checkboxId = useId();

  if (value !== "public" || !communityIsPrivate) return null;

  return (
    <div className="bg-secondary/50 flex flex-col gap-3 rounded-lg border p-4">
      <p id={warningId} className="text-sm leading-relaxed">
        {t("warning")}
      </p>
      <div className="flex items-start gap-2">
        {/* Ink tick: the page's one orange is its Save / Publish action. */}
        <Checkbox
          id={checkboxId}
          tone="ink"
          checked={confirmed}
          onCheckedChange={(next) => onConfirmedChange(next === true)}
          aria-describedby={warningId}
          aria-required="true"
          className="mt-0.5"
        />
        <label
          htmlFor={checkboxId}
          className="text-sm leading-snug font-medium"
        >
          {t("confirm")}
        </label>
      </div>
    </div>
  );
}
