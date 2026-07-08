"use client";

/**
 * Inline scheduling-conflict panel for the event creation/edit dialog
 * (Slice I, #206). Pure display component — the dialog owns the debounced
 * `checkConflicts` query and hands this component a derived `state` plus the
 * raw wire payload. See CONTEXT.md [[scheduling-conflict]] and ADR-0035 for
 * the domain vocabulary; DESIGN.md for the visual rules this panel must
 * respect (One Voice, Flat-By-Default, Mono-Is-Machine, House Kicker).
 *
 * `ConflictRow` is also exported standalone — Task 4 (#208) reuses it
 * read-only in the approval queue. `children` is a seam for Task 3 (#207) to
 * mount a slot-suggestion chip row inside the conflicts frame.
 *
 * Vertical budget: the row layout is deliberately two-line (~50px/row by
 * class math) so the full 3-visible-row frame stays under the binding
 * ~240px ceiling — see the height arithmetic in the task report before
 * adding anything to a row.
 */

import { Fragment, useId, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Info,
  Lock,
} from "lucide-react";

import type { RouterInputs } from "@/trpc/react";
import type { WireConflict } from "@/server/events/conflicts/corpus";
import type { ConflictGrade } from "@/server/events/conflicts/rule";
import { formatEventTimeRange } from "@/lib/event-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";

/** The `events.checkConflicts` input shape, sourced from the router's own
 * zod schema so this stays in lock-step with the wire contract. */
export type ConflictCheckInput = RouterInputs["events"]["checkConflicts"];

export type ConflictPanelState =
  | "idle"
  | "checking"
  | "clear"
  | "conflicts"
  | "error";

export interface CheckedAudience {
  slug: string;
  name: string;
}

export interface EventConflictPanelProps {
  state: ConflictPanelState;
  /** Pre-sorted by the server (most severe first). */
  conflicts: WireConflict[];
  checkedAudiences: CheckedAudience[];
  onRetry: () => void;
  /** T3 seam: slot-suggestion chip row, rendered inside the conflicts frame. */
  children?: React.ReactNode;
}

const VISIBLE_ROWS = 3;
const REST_MAX_HEIGHT_CLASS = "max-h-32";

// py-0 + leading-4 keeps each badge at 18px (16px line + 2px border), so a
// row's first line resolves to the title's 20px — load-bearing for the
// panel's ~240px vertical budget.
const COMPACT_BADGE_CLASS = "py-0 font-mono text-[10px] leading-4 uppercase";

const GRADE_BADGE_VARIANT: Record<
  ConflictGrade,
  "destructive" | "warning" | "info"
> = {
  clash: "destructive",
  "same-evening": "warning",
  "same-day": "info",
};

const GRADE_ICON: Record<
  ConflictGrade,
  React.ComponentType<{
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
  }>
> = {
  clash: AlertTriangle,
  "same-evening": Clock3,
  "same-day": Info,
};

const GRADE_LABEL_KEY: Record<ConflictGrade, string> = {
  clash: "conflictGradeClash",
  "same-evening": "conflictGradeSameEvening",
  "same-day": "conflictGradeSameDay",
};

/** Stable React key for a wire conflict row — tentative rows carry no id, so
 * their calendar date plus list index stands in (anonymization means two
 * tentative rows can otherwise be indistinguishable). */
function conflictRowKey(conflict: WireConflict, index: number): string {
  return conflict.tentative
    ? `tentative-${conflict.date}-${index}`
    : `revealed-${conflict.id}`;
}

/**
 * Single conflict row, two lines tall (vertical-budget compliant). Exported
 * standalone for the approval queue (#208) to reuse read-only. Renders the
 * [[tentative-hold]] anonymized shape when `conflict.tentative` — no title,
 * time, or link fields exist on that variant by wire contract, so there is
 * nothing else to render for it.
 */
export function ConflictRow({ conflict }: { conflict: WireConflict }) {
  const t = useTranslations("events");

  if (conflict.tentative) {
    return (
      <li className="py-1.5">
        <p className="border-info/40 bg-info/5 text-info flex items-center gap-2 rounded-md border border-dashed px-2 py-1 text-sm">
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {t("conflictTentativeHold", { date: conflict.date })}
          </span>
        </p>
      </li>
    );
  }

  const GradeIcon = GRADE_ICON[conflict.grade];
  const timeRange = formatEventTimeRange({
    date: conflict.date,
    startTime: conflict.startTime,
    endTime: conflict.endTime,
    timezone: conflict.timezone,
  });
  const metaParts: React.ReactNode[] = [];
  if (timeRange) metaParts.push(<span key="time">{timeRange}</span>);
  if (conflict.overlapMinutes != null) {
    metaParts.push(
      <span key="overlap">
        {t("conflictOverlapMinutes", { minutes: conflict.overlapMinutes })}
      </span>,
    );
  }
  if (conflict.audienceMatch === "related") {
    metaParts.push(
      <span key="related" className="truncate">
        {t("conflictRelatedAudience")}
      </span>,
    );
  }

  return (
    <li className="flex flex-col gap-0.5 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <Badge
          variant={GRADE_BADGE_VARIANT[conflict.grade]}
          className={`shrink-0 gap-1 tracking-wide ${COMPACT_BADGE_CLASS}`}
        >
          <GradeIcon className="size-3" aria-hidden="true" />
          <span aria-hidden="true">/</span>
          {t(GRADE_LABEL_KEY[conflict.grade])}
        </Badge>
        <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
          {conflict.title}
        </span>
        <Badge
          variant="outline"
          className={`ml-auto shrink-0 ${COMPACT_BADGE_CLASS}`}
        >
          {conflict.sourceType === "import"
            ? t("conflictSourceImport")
            : t("conflictSourceNative")}
        </Badge>
      </div>
      {(metaParts.length > 0 || conflict.sourceUrl) && (
        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          {metaParts.map((part, index) => (
            <Fragment key={index}>
              {index > 0 && <span aria-hidden="true">·</span>}
              {part}
            </Fragment>
          ))}
          {conflict.sourceUrl && (
            <a
              href={conflict.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("conflictSourceLinkLabel", {
                title: conflict.title,
              })}
              className="hover:text-foreground ml-auto shrink-0"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      )}
    </li>
  );
}

export function EventConflictPanel({
  state,
  conflicts,
  checkedAudiences,
  onRetry,
  children,
}: EventConflictPanelProps) {
  const t = useTranslations("events");
  const [expanded, setExpanded] = useState(false);
  const overflowRegionId = useId();

  if (state === "idle") return null;

  if (state === "checking") {
    return (
      <div aria-live="polite" className="sm:col-span-2">
        <div className="bg-muted/40 rounded-lg border p-3">
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div aria-live="polite" className="sm:col-span-2">
        <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <span>{t("conflictCheckFailed")}</span>
          <Button type="button" variant="outline" size="xs" onClick={onRetry}>
            {t("conflictRetry")}
          </Button>
        </p>
      </div>
    );
  }

  if (state === "clear") {
    const audiences = checkedAudiences.map((a) => a.name).join(", ");
    return (
      <div aria-live="polite" className="sm:col-span-2">
        <p className="text-foreground flex items-center gap-2 text-sm">
          <CheckCircle2
            className="text-success size-4 shrink-0"
            aria-hidden="true"
          />
          {t("conflictClear", { audiences })}
        </p>
      </div>
    );
  }

  // state === "conflicts"
  const visible = conflicts.slice(0, VISIBLE_ROWS);
  const rest = conflicts.slice(VISIBLE_ROWS);

  return (
    <div aria-live="polite" className="sm:col-span-2">
      <div className="bg-muted/40 rounded-lg border p-3">
        <SectionLabel as="p" bordered={false} className="mb-1">
          {t("conflictSectionLabel")}
        </SectionLabel>
        <ul className="divide-border/60 divide-y">
          {visible.map((conflict, index) => (
            <ConflictRow
              key={conflictRowKey(conflict, index)}
              conflict={conflict}
            />
          ))}
        </ul>
        {rest.length > 0 && (
          <>
            {expanded && (
              <ul
                id={overflowRegionId}
                className={`divide-border/60 ${REST_MAX_HEIGHT_CLASS} divide-y overflow-y-auto`}
              >
                {rest.map((conflict, index) => (
                  <ConflictRow
                    key={conflictRowKey(conflict, index + VISIBLE_ROWS)}
                    conflict={conflict}
                  />
                ))}
              </ul>
            )}
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={overflowRegionId}
              onClick={() => setExpanded((current) => !current)}
              className="text-muted-foreground hover:text-foreground mt-1 font-mono text-xs tracking-wide uppercase transition-colors motion-reduce:transition-none"
            >
              {expanded
                ? t("conflictShowFewer")
                : t("conflictShowMore", { count: rest.length })}
            </button>
          </>
        )}
        {children}
        <p className="text-muted-foreground mt-1 text-[11px] leading-4">
          {t("conflictHonesty")}
        </p>
      </div>
    </div>
  );
}
