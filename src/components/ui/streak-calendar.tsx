"use client";

import * as React from "react";
import { Check, Snowflake } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * StreakCalendar — adapted from Trophy's open-source Gamification UI Kit
 * (https://ui.trophy.so) and re-tokenized onto the Town Square design system
 * as a proof-of-fit (see DESIGN.md). Changes from the upstream component:
 *
 * - Active streak days use the SUCCESS token (consistency = a healthy/positive
 *   state per the Semantic-Status Rule), not the brand accent. A year of active
 *   cells in Signal Orange would shatter the One Voice ≤10% budget.
 * - "Today" is an Ink ring, not Signal Orange: the calendar lives in the
 *   dashboard side panel, and the dashboard's one orange is the active tab
 *   (One Voice Rule). (Green = your streak history, ink ring = you-are-here.)
 * - Days are plain cells unless `onDayClick` is given, so a read-only
 *   calendar adds no tab stops.
 * - Freezes use the INFO token (an informational state).
 * - Labels (weekdays, month markers) adopt the Geist Mono machine voice.
 * - Localized: dates and weekday names follow `locale`, and every visible or
 *   screen-reader word comes from `labels` (English defaults).
 * - Reuses the in-house <Tooltip> (the upstream imported @radix-ui/react-tooltip
 *   directly, which this project doesn't install — it uses the unified radix-ui).
 * - Token radii (rounded-md / rounded-sm) instead of arbitrary values.
 *
 * Wire `streak` to existing XP/activity data via tRPC; do not use Trophy's API.
 */

// Types (inlined — only the fields this component reads)
interface StreakPeriod {
  periodStart: string;
  periodEnd: string;
  usedFreeze?: boolean;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDateInPeriod(date: Date, period: StreakPeriod): boolean {
  const d = formatDateKey(date);
  return d >= period.periodStart && d <= period.periodEnd;
}

function didUseFreezeOnDate(date: Date, periods: StreakPeriod[]): boolean {
  for (const period of periods) {
    if (isDateInPeriod(date, period) && period.usedFreeze) {
      return true;
    }
  }
  return false;
}

function wasDateActive(date: Date, periods: StreakPeriod[]): boolean {
  for (const period of periods) {
    if (isDateInPeriod(date, period)) {
      return true;
    }
  }
  return false;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/** Every word the calendar says, so callers can pass translated copy. */
interface StreakCalendarLabels {
  /** Accessible name of the calendar grid. */
  calendar: string;
  today: string;
  active: string;
  freeze: string;
  idle: string;
  future: string;
  /** Year-view heading. */
  lastYear: string;
  /** Year-view subheading; receives the formatted end date. */
  endingOn: (date: string) => string;
}

const DEFAULT_LABELS: StreakCalendarLabels = {
  calendar: "Streak calendar",
  today: "today",
  active: "streak active",
  freeze: "freeze used",
  idle: "no activity",
  future: "future",
  lastYear: "Last 365 days",
  endingOn: (date) => `Ending ${date}`,
};

interface StreakCalendarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Streak periods (wire to existing activity/XP data). */
  streak: StreakPeriod[];
  /** Calendar layout variant. */
  view?: "week" | "month" | "year";
  /** Month to display (default: current month). */
  month?: Date;
  /** Date used for week view (default: today). */
  referenceDate?: Date;
  /** Show freeze indicators. */
  showFreezes?: boolean;
  /** Start of week: 0 = Sunday, 1 = Monday. */
  startOfWeek?: 0 | 1;
  /** Callback when a day is clicked. */
  onDayClick?: (date: Date, wasActive: boolean) => void;
  /** BCP 47 locale for dates and weekday names. */
  locale?: string;
  /** Translated copy; missing entries fall back to English. */
  labels?: Partial<StreakCalendarLabels>;
}

/** Short weekday names in calendar order, e.g. ["Mo", …] or ["ma", …]. */
function getWeekdayNames(locale: string, startOfWeek: 0 | 1): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: "short" });
  // 2024-01-07 is a Sunday.
  return Array.from({ length: 7 }, (_, index) =>
    format.format(new Date(2024, 0, 7 + index + startOfWeek)),
  );
}

function getDateKey(date: Date): string {
  return formatDateKey(date);
}

function getWeekStart(date: Date, startOfWeek: 0 | 1): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const offset = startOfWeek === 1 ? (day + 6) % 7 : day;
  next.setDate(next.getDate() - offset);
  return next;
}

function getWeekDates(reference: Date, startOfWeek: 0 | 1): Date[] {
  const start = getWeekStart(reference, startOfWeek);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function getWeekdayIndex(date: Date, startOfWeek: 0 | 1): number {
  const day = date.getDay();
  return startOfWeek === 1 ? (day + 6) % 7 : day;
}

function getGitDates(endDate: Date): Date[] {
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Array.from({ length: 365 }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (364 - index));
    return date;
  });
}

function getGitCells(
  endDate: Date,
  startOfWeek: 0 | 1,
): {
  cells: (Date | null)[];
  dates: Date[];
} {
  const dates = getGitDates(endDate);
  const firstDate = dates[0];
  if (!firstDate) return { cells: [], dates: [] };

  const leadingEmptyCells = getWeekdayIndex(firstDate, startOfWeek);
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingEmptyCells }, () => null),
    ...dates,
  ];

  return { cells, dates };
}

type DayCellProps = Omit<React.HTMLAttributes<HTMLElement>, "onClick"> & {
  /**
   * Click handler. Without one the day is a plain, non-focusable cell, so a
   * read-only calendar does not put a tab stop on every day.
   */
  onSelect?: () => void;
  disabled?: boolean;
};

/** One day: a button when the calendar is interactive, a div otherwise. */
const DayCell = React.forwardRef<HTMLElement, DayCellProps>(
  ({ onSelect, disabled, ...props }, ref) =>
    onSelect ? (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={onSelect}
        disabled={disabled}
        {...props}
      />
    ) : (
      <div ref={ref as React.Ref<HTMLDivElement>} {...props} />
    ),
);
DayCell.displayName = "DayCell";

const StreakCalendar = React.forwardRef<HTMLDivElement, StreakCalendarProps>(
  (
    {
      className,
      streak,
      view = "week",
      month = new Date(),
      referenceDate = new Date(),
      showFreezes = true,
      startOfWeek = 0,
      onDayClick,
      locale = "en-US",
      labels: labelOverrides,
      ...props
    },
    ref,
  ) => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const daysInMonth = getDaysInMonth(year, monthIndex);
    const firstDayOfMonth = getFirstDayOfMonth(year, monthIndex);

    const adjustedFirstDay =
      startOfWeek === 1 ? (firstDayOfMonth + 6) % 7 : firstDayOfMonth;

    const labels = { ...DEFAULT_LABELS, ...labelOverrides };
    const weekdays = getWeekdayNames(locale, startOfWeek);
    const statusLabel = (state: {
      isActive: boolean;
      usedFreeze: boolean;
      isFuture: boolean;
    }) =>
      state.usedFreeze
        ? labels.freeze
        : state.isActive
          ? labels.active
          : state.isFuture
            ? labels.future
            : labels.idle;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const periods = streak ?? [];
    const weekDates = getWeekDates(referenceDate, startOfWeek);
    const { cells: gitCells, dates: gitDates } = getGitCells(
      today,
      startOfWeek,
    );
    const gitColumnCount = Math.ceil(gitCells.length / 7);
    const gitGridTemplateColumns = `repeat(${gitColumnCount}, 1rem)`;
    const gitMonthLabels: Array<{ column: number; label: string }> = [];
    const seenGitMonths = new Set<string>();

    gitCells.forEach((date, cellIndex) => {
      if (!date) return;
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (!seenGitMonths.has(monthKey) && date.getDate() === 1) {
        seenGitMonths.add(monthKey);
        gitMonthLabels.push({
          column: Math.floor(cellIndex / 7),
          label: date.toLocaleDateString(locale, { month: "short" }),
        });
      }
    });

    const firstDate = gitDates[0];
    if (firstDate) {
      const firstMonthKey = `${firstDate.getFullYear()}-${firstDate.getMonth()}`;
      if (!seenGitMonths.has(firstMonthKey)) {
        gitMonthLabels.unshift({
          column: 0,
          label: firstDate.toLocaleDateString(locale, { month: "short" }),
        });
      }
    }

    const days: (number | null)[] = [];
    for (let i = 0; i < adjustedFirstDay; i++) {
      days.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    const monthName = month.toLocaleDateString(locale, { month: "long" });
    const gitEndDate = today.toLocaleDateString(locale, {
      month: "long",
      day: "numeric",
    });

    // Freeze = informational state → INFO token.
    const freezeColorStyles = {
      "--freeze-color": "var(--info)",
      "--freeze-foreground-color": "var(--info-foreground)",
    } as React.CSSProperties;

    const getCellState = (date: Date) => {
      const isToday = date.getTime() === today.getTime();
      const isFuture = date > today;
      const isActive = wasDateActive(date, periods);
      const usedFreeze = showFreezes && didUseFreezeOnDate(date, periods);
      return { isToday, isFuture, isActive, usedFreeze };
    };

    return (
      <div
        ref={ref}
        role="grid"
        aria-label={labels.calendar}
        className={cn(
          "w-full",
          view === "month" ? "max-w-sm" : "max-w-3xl",
          className,
        )}
        {...props}
      >
        {view === "month" && (
          <>
            <div className="mb-4 text-center">
              <h3 className="text-lg font-semibold" id="streak-calendar-title">
                {monthName} {year}
              </h3>
            </div>
            <div role="row" className="mb-2 grid grid-cols-7 gap-1">
              {weekdays.map((day) => (
                <div
                  key={day}
                  role="columnheader"
                  className="text-muted-foreground text-center font-mono text-xs font-medium tracking-wider uppercase"
                >
                  {day}
                </div>
              ))}
            </div>
            <div role="rowgroup" className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (day === null) {
                  return (
                    <div key={`empty-${index}`} className="aspect-square" />
                  );
                }
                const date = new Date(year, monthIndex, day);
                const { isToday, isFuture, isActive, usedFreeze } =
                  getCellState(date);
                const dateLabel = date.toLocaleDateString(locale, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                });
                return (
                  <DayCell
                    key={day}
                    role="gridcell"
                    aria-label={`${dateLabel}${isToday ? `, ${labels.today}` : ""}, ${statusLabel({ isActive, usedFreeze, isFuture })}`}
                    aria-current={isToday ? "date" : undefined}
                    onSelect={onDayClick && (() => onDayClick(date, isActive))}
                    disabled={isFuture}
                    className={cn(
                      "relative flex aspect-square items-center justify-center rounded-md p-1 text-sm transition-colors",
                      onDayClick &&
                        "hover:bg-muted focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                      // Today = you-are-here → an Ink ring (no orange; see above).
                      isToday &&
                        "ring-foreground font-semibold ring-2 ring-inset",
                      isFuture && "text-muted-foreground/50",
                      isFuture && onDayClick && "cursor-not-allowed",
                      // Active streak = success (healthy/consistent), not the accent.
                      isActive &&
                        !usedFreeze &&
                        "bg-success text-success-foreground",
                      isActive &&
                        !usedFreeze &&
                        onDayClick &&
                        "hover:bg-success/90",
                      usedFreeze &&
                        "bg-[var(--freeze-color)] text-[var(--freeze-foreground-color)]",
                      usedFreeze && onDayClick && "hover:opacity-90",
                    )}
                    style={usedFreeze ? freezeColorStyles : undefined}
                  >
                    {day}
                  </DayCell>
                );
              })}
            </div>
          </>
        )}

        {view === "week" && (
          <div role="rowgroup" className="grid grid-cols-7 gap-2">
            {weekDates.map((date) => {
              const { isToday, isFuture, isActive, usedFreeze } =
                getCellState(date);
              const dayLabel = date.toLocaleDateString(locale, {
                weekday: "short",
              });
              return (
                <div
                  key={getDateKey(date)}
                  className="flex flex-col items-center gap-2"
                >
                  <DayCell
                    role="gridcell"
                    aria-current={isToday ? "date" : undefined}
                    aria-label={`${date.toLocaleDateString(locale, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}${isToday ? `, ${labels.today}` : ""}, ${statusLabel({ isActive, usedFreeze, isFuture })}`}
                    onSelect={onDayClick && (() => onDayClick(date, isActive))}
                    disabled={isFuture}
                    className={cn(
                      "relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-colors",
                      onDayClick &&
                        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                      onDayClick && !isFuture && "hover:opacity-90",
                      isToday && "border-foreground",
                      isFuture &&
                        "border-border/40 bg-muted/20 text-muted-foreground/40",
                      isFuture && onDayClick && "cursor-not-allowed",
                      isActive &&
                        !usedFreeze &&
                        "border-success bg-success text-success-foreground",
                      usedFreeze &&
                        "border-[var(--freeze-color)] bg-[var(--freeze-color)] text-[var(--freeze-foreground-color)]",
                      !isActive &&
                        !usedFreeze &&
                        !isFuture &&
                        "border-border/60 bg-muted/30",
                    )}
                    style={usedFreeze ? freezeColorStyles : undefined}
                  >
                    {usedFreeze ? (
                      <Snowflake
                        className={cn(
                          "h-5 w-5",
                          isToday && "!text-muted-foreground/20",
                        )}
                      />
                    ) : (
                      isActive && (
                        <Check
                          className={cn(
                            "h-5 w-5",
                            isToday && "!text-muted-foreground/20",
                          )}
                        />
                      )
                    )}
                  </DayCell>
                  <span
                    className={cn(
                      "font-mono text-xs tracking-wider uppercase",
                      isFuture
                        ? "text-muted-foreground/50"
                        : "text-muted-foreground",
                    )}
                  >
                    {dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {view === "year" && (
          <>
            <div className="mb-4 text-center">
              <h3 className="text-lg font-semibold" id="streak-calendar-title">
                {labels.lastYear}
              </h3>
              <p className="text-muted-foreground font-mono text-xs">
                {labels.endingOn(gitEndDate)}
              </p>
            </div>
            <div className="overflow-x-auto">
              <div className="inline-block pr-16">
                <div
                  aria-hidden="true"
                  className="mb-2 grid gap-1"
                  style={{ gridTemplateColumns: gitGridTemplateColumns }}
                >
                  {gitMonthLabels.map((month) => (
                    <span
                      key={`${month.column}-${month.label}`}
                      className="text-muted-foreground font-mono text-xs tracking-wider whitespace-nowrap uppercase"
                      style={{ gridColumnStart: month.column + 1 }}
                    >
                      {month.label}
                    </span>
                  ))}
                </div>
                <TooltipProvider>
                  <div
                    role="rowgroup"
                    className="grid grid-flow-col grid-rows-7 gap-1"
                    style={{ gridTemplateColumns: gitGridTemplateColumns }}
                  >
                    {gitCells.map((date, index) => {
                      if (!date) {
                        return (
                          <div key={`git-empty-${index}`} className="h-4 w-4" />
                        );
                      }
                      const { isToday, isActive, usedFreeze } =
                        getCellState(date);
                      const dateLabel = date.toLocaleDateString(locale, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      });
                      return (
                        <Tooltip key={getDateKey(date)}>
                          <TooltipTrigger asChild>
                            <DayCell
                              role="gridcell"
                              aria-current={isToday ? "date" : undefined}
                              aria-label={`${dateLabel}${isToday ? `, ${labels.today}` : ""}, ${statusLabel({ isActive, usedFreeze, isFuture: false })}`}
                              onSelect={
                                onDayClick && (() => onDayClick(date, isActive))
                              }
                              className={cn(
                                "border-border/40 h-4 w-4 rounded-sm border transition-colors",
                                onDayClick && "hover:ring-ring hover:ring-1",
                                isToday &&
                                  "border-foreground ring-foreground ring-1",
                                isActive &&
                                  !usedFreeze &&
                                  "bg-success border-success/80",
                                usedFreeze &&
                                  "border-[var(--freeze-color)] bg-[var(--freeze-color)]",
                                !isActive && !usedFreeze && "bg-muted/40",
                              )}
                              style={usedFreeze ? freezeColorStyles : undefined}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {dateLabel}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </TooltipProvider>
              </div>
            </div>
          </>
        )}
      </div>
    );
  },
);
StreakCalendar.displayName = "StreakCalendar";

export { StreakCalendar, didUseFreezeOnDate, getWeekDates, wasDateActive };
export type { StreakCalendarLabels, StreakCalendarProps, StreakPeriod };
