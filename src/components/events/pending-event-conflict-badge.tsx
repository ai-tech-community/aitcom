"use client";

/**
 * Approval-queue conflict badge (Slice I, Task 4 / #208). Runs a fresh
 * `checkConflicts` for a pending event's own scheduling fields — no stored
 * snapshot, so a reviewer always sees the *current* state of the corpus,
 * even if it changed since submission. Silent (renders null) while loading
 * and on a clear result, matching the create/edit dialog's "no noise"
 * convention; only a genuine conflict earns screen space.
 *
 * Reuses `ConflictRow` (read-only) and the grade → variant/icon/label maps
 * from `event-conflict-panel.tsx` so the summary chip and the expansion both
 * speak the same visual language as the creation-flow panel.
 */

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

import { api } from "@/trpc/react";
import type { RouterInputs } from "@/trpc/react";
import type { WireConflict } from "@/server/events/conflicts/corpus";
import { badgeVariants } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import { cn } from "@/lib/utils";
import {
  ConflictRow,
  GRADE_BADGE_VARIANT,
  GRADE_ICON,
  GRADE_LABEL_KEY,
} from "./event-conflict-panel";

type ConflictCheckInput = RouterInputs["events"]["checkConflicts"];

export interface PendingEventForConflictCheck {
  id: number;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  format?: string | null;
  city?: string | null;
  audience: { slug: string; name: string }[];
}

function conflictRowKey(conflict: WireConflict, index: number): string {
  return conflict.tentative
    ? `tentative-${conflict.date}-${index}`
    : `revealed-${conflict.id}`;
}

export function PendingEventConflictBadge({
  event,
}: {
  event: PendingEventForConflictCheck;
}) {
  const t = useTranslations("events");
  const [expanded, setExpanded] = useState(false);
  const expansionId = useId();

  const audienceSlugs = event.audience.map((a) => a.slug);
  const enabled = audienceSlugs.length >= 1;

  // excludeEventId: event.id keeps the pending event from conflicting with
  // itself. resolveExcludeEventId honors it for every role that can reach
  // this queue — the submitter and active owner/admin/moderator of the
  // event's community (the same trio getPendingCommunityEvents admits) — so
  // no self-match ever arrives here. That server-side exclusion is the only
  // correct place to handle it: a draft's self-match would come back as an
  // anonymized tentative row (no id on the wire), unfilterable client-side.
  const query = api.events.checkConflicts.useQuery(
    {
      date: event.date,
      startTime: event.startTime ?? undefined,
      endTime: event.endTime ?? undefined,
      timezone: event.timezone ?? undefined,
      format: (event.format ?? "online") as ConflictCheckInput["format"],
      city: event.city ?? undefined,
      audience: audienceSlugs,
      excludeEventId: event.id,
    },
    { enabled },
  );

  if (query.isLoading || !query.data) return null;

  const conflicts = query.data.conflicts;
  if (conflicts.length === 0) return null;

  // Pre-sorted by the server (most severe first).
  const highestGrade = conflicts[0]!.grade;
  const GradeIcon = GRADE_ICON[highestGrade];

  return (
    <>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expansionId}
        onClick={() => setExpanded((current) => !current)}
        aria-label={t("pendingConflictBadgeAriaLabel", {
          count: conflicts.length,
          grade: t(GRADE_LABEL_KEY[highestGrade]),
        })}
        className={cn(
          badgeVariants({ variant: GRADE_BADGE_VARIANT[highestGrade] }),
          // sm:order-4 shares the queue row's status-chip slot (see
          // page.tsx's `contents` wrapper note); the expansion below carries
          // its own order so it always wraps to a trailing full-width line.
          "cursor-pointer gap-1 py-0 font-mono text-[10px] leading-4 tracking-wide uppercase sm:order-4",
        )}
      >
        <GradeIcon className="size-3" aria-hidden="true" />
        <span aria-hidden="true">/</span>
        {t(GRADE_LABEL_KEY[highestGrade])}
        <span aria-hidden="true">·</span>
        {conflicts.length}
      </button>
      {expanded && (
        <div
          id={expansionId}
          className="bg-muted/40 w-full rounded-lg border p-3 sm:order-20 sm:basis-full"
        >
          <SectionLabel as="p" bordered={false} className="mb-1">
            {t("conflictSectionLabel")}
          </SectionLabel>
          <ul className="divide-border/60 divide-y">
            {conflicts.map((conflict, index) => (
              <ConflictRow
                key={conflictRowKey(conflict, index)}
                conflict={conflict}
              />
            ))}
          </ul>
          <p className="text-muted-foreground mt-1 text-[11px] leading-4">
            {t("conflictHonesty")}
          </p>
        </div>
      )}
    </>
  );
}
