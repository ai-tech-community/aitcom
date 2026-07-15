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
 * Vertical budget: the row layout is deliberately two-line so the full
 * 3-visible-row frame stays under a ~250px ceiling (Tailwind defaults, 16px
 * root; worst case = 3 revealed rows + expander visible) — the arithmetic,
 * so nothing added to a row silently blows the budget:
 *
 *   Frame border (`border`, 1px top + bottom)                       2px
 *   Frame padding (`p-3`, 12px × 2)                                24px
 *   Header (SectionLabel `text-xs` lh 16px + `mb-1` 4px)            20px
 *   Row line 1 (max of title `text-sm` lh 20px;
 *     badge `leading-4` 16px + `py-0` + 2px border = 18px)          20px
 *   Row line gap (`gap-0.5`)                                        2px
 *   Row line 2 (`text-xs` lh 16px)                                 16px
 *   Row padding (`py-1.5`, 6px × 2)                                12px
 *   → Row total                                                    50px
 *   3 rows + 2 `divide-y` borders (3 × 50 + 2)                    152px
 *   Expander (`mt-1` 4px + `min-h-6` 24px — WCAG 2.5.8 target)     28px
 *   Honesty line (`mt-1` 4px + `text-[11px] leading-4` 16px)       20px
 *   → Frame total: 2 + 24 + 20 + 152 + 28 + 20 = 246px ≤ ~250px      ✓
 *
 * (The tentative row is shorter still — 42px — and the expanded overflow
 * list stays capped at `max-h-32` (128px) with internal scroll, so it never
 * grows the frame past the cap.)
 */

import { Fragment, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import type { SlotSuggestion } from "@/server/events/conflicts/suggest";
import { eventWallTimeToUtc, formatEventTimeRange } from "@/lib/event-time";
import { cn } from "@/lib/utils";
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
  /** Pre-sorted by the server (most severe first). During a re-check the
   * dialog keeps passing the *previous* result here (see `lastConflictData`
   * in event-form-dialog.tsx), so the frame stays rendered — dimmed, with a
   * "/ RECHECKING" header — instead of collapsing to a skeleton and shoving
   * every field below it ~180px per debounce cycle. */
  conflicts: WireConflict[];
  checkedAudiences: CheckedAudience[];
  onRetry: () => void;
  /** Human-readable catchment name (the dialog passes the trimmed `city`
   * field when non-empty) — named in the "clear" message so "no conflicts"
   * doesn't read as a blanket global guarantee when the check was scoped to
   * a specific place. Omitted entirely (falls back to `conflictClear`) when
   * there's no known scope, e.g. an online-only event with no city. */
  scope?: string;
  /** T3 seam: slot-suggestion chip row, rendered inside the conflicts frame. */
  children?: React.ReactNode;
}

const VISIBLE_ROWS = 3;
const REST_MAX_HEIGHT_CLASS = "max-h-32";

// py-0 + leading-4 keeps each badge at 18px (16px line + 2px border), so a
// row's first line resolves to the title's 20px — load-bearing for the
// panel's ~240px vertical budget.
const COMPACT_BADGE_CLASS = "py-0 font-mono text-[10px] leading-4 uppercase";

// Exported so the approval-queue badge (Task 4 / #208) can render a
// summary chip in the same visual language as `ConflictRow` without
// re-deriving the grade → variant/icon/label mapping.
export const GRADE_BADGE_VARIANT: Record<
  ConflictGrade,
  "destructive" | "warning" | "info"
> = {
  clash: "destructive",
  "same-evening": "warning",
  "same-day": "info",
};

export const GRADE_ICON: Record<
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

export const GRADE_LABEL_KEY: Record<ConflictGrade, string> = {
  clash: "conflictGradeClash",
  "same-evening": "conflictGradeSameEvening",
  "same-day": "conflictGradeSameDay",
};

/** Stable React key for a wire conflict row — tentative rows carry no id, so
 * their calendar date plus list index stands in (anonymization means two
 * tentative rows can otherwise be indistinguishable). Exported so the
 * approval-queue badge (`pending-event-conflict-badge.tsx`) shares this
 * exact key derivation instead of maintaining its own duplicate. */
export function conflictRowKey(conflict: WireConflict, index: number): string {
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
  if (timeRange)
    metaParts.push(
      <span key="time" className="whitespace-nowrap">
        {timeRange}
      </span>,
    );
  if (conflict.overlapMinutes != null) {
    metaParts.push(
      <span key="overlap" className="whitespace-nowrap">
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
              // min 24×24 target (WCAG 2.5.8); -my-1 keeps the meta line's
              // 16px vertical footprint so the row budget holds.
              className="hover:text-foreground -my-1 ml-auto flex min-h-6 min-w-6 shrink-0 items-center justify-center"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      )}
    </li>
  );
}

/** The (date, startTime, endTime) triple a chip click hands back to the
 * dialog — deliberately narrower than `SlotSuggestion` so `onApply` can never
 * see `reasons`/`dayOffset` and accidentally leak them into form state. */
export type SlotSuggestionTriple = Pick<
  SlotSuggestion,
  "date" | "startTime" | "endTime"
>;

export interface SlotSuggestionChipsProps {
  /** Server caps this at 5. */
  suggestions: SlotSuggestion[];
  checkedAudiences: CheckedAudience[];
  /** Event timezone (already defaulted by the caller) — anchors the
   * weekday/date label so it never drifts a day at a UTC boundary. */
  timezone: string;
  onApply: (slot: SlotSuggestionTriple) => void;
}

/** "Wed, Jul 15 · 18:00–20:00", locale- and timezone-aware. Anchored at
 * noon (mirrors `suggest.ts`'s own `weekdayOfDateInZone`) so DST-boundary
 * dates still resolve to the correct calendar day. */
function formatSuggestionDateTime(
  suggestion: SlotSuggestionTriple,
  timezone: string,
  locale: string,
): string {
  const instant = eventWallTimeToUtc(suggestion.date, "12:00", timezone);
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: timezone,
  }).format(instant);
  return `${dateLabel} · ${suggestion.startTime}–${suggestion.endTime}`;
}

/** Machine reason codes → display copy, resolving `preferred:<slug>` against
 * the audiences the organizer actually checked (never an arbitrary lookup —
 * a suggestion's reasons are always a subset of the checked audiences). */
function reasonLabels(
  reasons: string[],
  checkedAudiences: CheckedAudience[],
  t: ReturnType<typeof useTranslations>,
): string[] {
  return reasons.map((reason) => {
    if (reason === "clear") return t("slotReasonClear");
    if (reason === "original-time") return t("slotReasonOriginalTime");
    if (reason.startsWith("preferred:")) {
      const slug = reason.slice("preferred:".length);
      const audience =
        checkedAudiences.find((a) => a.slug === slug)?.name ?? slug;
      return t("slotReasonPreferred", { audience });
    }
    return reason;
  });
}

/**
 * One-click alternative-slot chips (Slice I, #207). Pure display + callback —
 * the dialog owns applying a chosen slot to form state and re-running the
 * debounced conflict check. Mounted via the panel's `children` seam so it
 * only ever renders inside the "conflicts" frame (see `EventConflictPanel`).
 */
export function SlotSuggestionChips({
  suggestions,
  checkedAudiences,
  timezone,
  onApply,
}: SlotSuggestionChipsProps) {
  const t = useTranslations("events");
  const locale = useLocale();

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-2">
      <SectionLabel as="p" bordered={false} className="mb-1">
        {t("slotSuggestionsSectionLabel")}
      </SectionLabel>
      <ul className="flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <li
            key={`${suggestion.date}|${suggestion.startTime}|${suggestion.endTime}`}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onApply({
                  date: suggestion.date,
                  startTime: suggestion.startTime,
                  endTime: suggestion.endTime,
                })
              }
            >
              {/* Gives the chip an action-verb accessible name ("Apply
                  suggested time: Wed, Jul 15 …") instead of a bare fact —
                  sr-only prefix rather than aria-label so the visible reason
                  text stays part of the name. */}
              <span className="sr-only">{t("slotApplySrLabel")} </span>
              <span className="font-mono">
                {formatSuggestionDateTime(suggestion, timezone, locale)}
              </span>
              <span className="text-muted-foreground font-normal normal-case">
                {reasonLabels(suggestion.reasons, checkedAudiences, t).join(
                  " · ",
                )}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EventConflictPanel({
  state,
  conflicts,
  checkedAudiences,
  onRetry,
  scope,
  children,
}: EventConflictPanelProps) {
  const t = useTranslations("events");
  const [expanded, setExpanded] = useState(false);
  const overflowRegionId = useId();

  if (state === "idle") return null;

  let inner: React.ReactNode;

  if (state === "checking" && conflicts.length === 0) {
    // First check (no previous result to keep on screen): a skeleton, with
    // an sr-only status line so the live region actually announces something
    // — a bare skeleton is silent to screen readers.
    inner = (
      <div className="bg-muted/40 rounded-lg border p-3">
        <span className="sr-only">{t("conflictChecking")}</span>
        <Skeleton className="h-10 w-full" />
      </div>
    );
  } else if (state === "error") {
    inner = (
      <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
        <span>{t("conflictCheckFailed")}</span>
        <Button type="button" variant="outline" size="xs" onClick={onRetry}>
          {t("conflictRetry")}
        </Button>
      </p>
    );
  } else if (state === "clear") {
    const audiences = checkedAudiences.map((a) => a.name).join(", ");
    inner = (
      <p className="text-foreground flex items-center gap-2 text-sm">
        <CheckCircle2
          className="text-success size-4 shrink-0"
          aria-hidden="true"
        />
        {scope
          ? t("conflictClearScoped", { audiences, scope })
          : t("conflictClear", { audiences })}
      </p>
    );
  } else {
    // state === "conflicts", or state === "checking" with the previous
    // result still in hand — the frame stays mounted (dimmed, relabeled)
    // during a re-check so the organizer can compare against what they just
    // saw and nothing below the panel jumps.
    const rechecking = state === "checking";
    const visible = conflicts.slice(0, VISIBLE_ROWS);
    const rest = conflicts.slice(VISIBLE_ROWS);

    inner = (
      <div
        aria-busy={rechecking}
        className={cn(
          "bg-muted/40 rounded-lg border p-3 transition-opacity duration-200 motion-reduce:transition-none",
          rechecking && "opacity-60",
        )}
      >
        <SectionLabel as="p" bordered={false} className="mb-1">
          {rechecking ? t("conflictRechecking") : t("conflictSectionLabel")}
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
              {...(expanded ? { "aria-controls": overflowRegionId } : {})}
              onClick={() => setExpanded((current) => !current)}
              className="text-muted-foreground hover:text-foreground mt-1 flex min-h-6 items-center font-mono text-xs tracking-wide uppercase transition-colors motion-reduce:transition-none"
            >
              {expanded
                ? t("conflictShowFewer")
                : t("conflictShowMore", { count: rest.length })}
            </button>
          </>
        )}
        {/* A disabled fieldset (display: contents, so no layout box) hard-
            blocks the slot chips while a re-check is in flight — a click on
            a dimmed chip would apply a slot computed against inputs the
            organizer just changed. */}
        <fieldset disabled={rechecking} className="contents">
          {children}
        </fieldset>
        <p className="text-muted-foreground mt-1 text-[11px] leading-4">
          {t("conflictHonesty")}
        </p>
      </div>
    );
  }

  // One live region mounted across every visible state: ARIA live regions
  // only reliably announce *mutations to an existing node* — a div that
  // mounts already containing its content (the previous shape here, one
  // aria-live div per state branch) is silent or double-announced depending
  // on the SR/browser pair. Keeping the wrapper stable and swapping only
  // `inner` makes checking → clear/conflicts/error transitions announceable.
  return (
    <div aria-live="polite" className="sm:col-span-2">
      {inner}
    </div>
  );
}
