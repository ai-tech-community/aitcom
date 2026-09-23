import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Insights marks, drawn as HTML tables so every value is readable without
 * hovering and screen readers get a real table. One hue (--chart-2, teal in
 * both themes); lighter steps are validated ordinal steps of that hue:
 * light 100/80/60 %, dark 100/70/45 % mixed into the card surface.
 */
export const INSIGHT_FILL = {
  strong: "bg-chart-2",
  mid: "bg-[color-mix(in_oklab,var(--chart-2)_80%,var(--card))] dark:bg-[color-mix(in_oklab,var(--chart-2)_70%,var(--card))]",
  soft: "bg-[color-mix(in_oklab,var(--chart-2)_60%,var(--card))] dark:bg-[color-mix(in_oklab,var(--chart-2)_45%,var(--card))]",
} as const;

/** Bar length as a share of the track, never thinner than a visible sliver. */
function barWidth(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "0px";
  return `max(3px, ${(value / max) * 100}%)`;
}

export type RankedBarRow = {
  key: string;
  label: ReactNode;
  value: number;
  /** Text at the bar tip, e.g. "1,234" or "40+". */
  display: string;
  /** A secondary note after the value, e.g. "46 hiring". */
  note?: string;
  /** Hiring share inside the bar, drawn as the strong step. */
  emphasis?: number;
  /** "soft" for a catch-all row such as "54 other countries". */
  tone?: "soft";
};

/**
 * Ranked single-series bars. Rows grow from one baseline; the value sits
 * at the tip. With `emphasis`, the bar splits into a strong lead segment and
 * a soft remainder, separated by a 2px surface gap.
 */
export function RankedBars({
  caption,
  labelHeader,
  valueHeader,
  rows,
  labelWidth = "w-36 sm:w-44",
  valueRoom = "pr-16",
}: {
  caption: string;
  labelHeader: string;
  valueHeader: string;
  rows: readonly RankedBarRow[];
  labelWidth?: string;
  /** Right padding that fits the widest value text beyond a full bar. */
  valueRoom?: string;
}) {
  const max = Math.max(0, ...rows.map((row) => row.value));
  return (
    <table
      data-insight-bars=""
      className="w-full table-fixed border-separate border-spacing-y-1.5 text-sm"
    >
      <caption className="sr-only">{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{labelHeader}</th>
          <th scope="col">{valueHeader}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} data-insight-row={row.key} className="group">
            <th
              scope="row"
              className={cn(
                "pr-3 text-left align-middle font-normal",
                labelWidth,
              )}
            >
              <span className="block truncate">{row.label}</span>
            </th>
            <td className="align-middle">
              {/* The track reserves room for the value so it never clips. */}
              <div className={cn("flex items-center gap-2", valueRoom)}>
                <div
                  className="flex h-5 min-w-0 shrink-0 gap-0.5"
                  style={{ width: barWidth(row.value, max) }}
                >
                  {row.emphasis !== undefined && row.emphasis > 0 ? (
                    <>
                      <span
                        className={cn(
                          "h-full shrink-0 transition-opacity group-hover:opacity-85",
                          INSIGHT_FILL.strong,
                          row.emphasis >= row.value && "rounded-r-[4px]",
                        )}
                        style={{
                          width: `max(3px, ${(row.emphasis / row.value) * 100}%)`,
                        }}
                      />
                      {row.emphasis < row.value ? (
                        <span
                          className={cn(
                            "h-full min-w-0 flex-1 rounded-r-[4px] transition-opacity group-hover:opacity-85",
                            INSIGHT_FILL.soft,
                          )}
                        />
                      ) : null}
                    </>
                  ) : (
                    <span
                      className={cn(
                        "h-full w-full rounded-r-[4px] transition-opacity group-hover:opacity-85",
                        row.tone === "soft" || row.emphasis !== undefined
                          ? INSIGHT_FILL.soft
                          : INSIGHT_FILL.strong,
                      )}
                    />
                  )}
                </div>
                <span className="shrink-0 font-mono text-xs whitespace-nowrap tabular-nums">
                  {row.display}
                  {row.note ? (
                    <span className="text-muted-foreground"> · {row.note}</span>
                  ) : null}
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export type ShareSegment = {
  key: string;
  label: string;
  value: number;
  /** Count text for the legend, e.g. "4,676". */
  display: string;
  /** Share text for the legend, e.g. "65%". */
  share: string;
  fill: string;
};

/**
 * One 100% bar split into ordered segments with 2px surface gaps, plus a
 * legend that carries every value, so colour is never the only key.
 */
export function ShareBar({
  caption,
  segments,
}: {
  caption: string;
  segments: readonly ShareSegment[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const shown = segments.filter((segment) => segment.value > 0);
  return (
    <figure className="flex flex-col gap-4">
      <div
        aria-hidden="true"
        className="flex h-6 w-full gap-0.5 overflow-hidden rounded-[4px]"
      >
        {shown.map((segment) => (
          <span
            key={segment.key}
            className={cn("h-full", segment.fill)}
            style={{
              flexGrow: segment.value,
              flexBasis: 0,
              minWidth: "3px",
            }}
          />
        ))}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {segments.map((segment) => (
            <tr key={segment.key}>
              <th scope="row" className="py-1 text-left font-normal">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2.5 shrink-0 rounded-[2px]",
                      segment.fill,
                    )}
                  />
                  {segment.label}
                </span>
              </th>
              <td className="py-1 text-right font-mono text-xs tabular-nums">
                {segment.display}
              </td>
              <td className="text-muted-foreground w-14 py-1 text-right font-mono text-xs tabular-nums">
                {total > 0 ? segment.share : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Legend for a two-step bar: rect swatches mirror the bar marks. */
export function StepLegend({
  items,
}: {
  items: ReadonlyArray<{ label: string; fill: string }>;
}) {
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("size-2.5 rounded-[2px]", item.fill)}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Monthly columns for listing history. Columns cap at 24px and grow from
 * one baseline; values live in the table twin and each column's title.
 */
export function MonthColumns({
  caption,
  monthHeader,
  valueHeader,
  rows,
  format,
}: {
  caption: string;
  monthHeader: string;
  valueHeader: string;
  rows: ReadonlyArray<{ month: string; label: string; count: number }>;
  format: (value: number) => string;
}) {
  const max = Math.max(0, ...rows.map((row) => row.count));
  const labelEvery = Math.max(1, Math.ceil(rows.length / 6));
  return (
    <figure className="flex flex-col gap-2">
      <div aria-hidden="true" className="flex h-40 items-end gap-1 border-b">
        {rows.map((row) => (
          <div
            key={row.month}
            title={`${row.label}: ${format(row.count)}`}
            className="flex h-full min-w-0 flex-1 items-end justify-center"
          >
            <span
              className={cn(
                "w-full max-w-6 rounded-t-[4px] hover:opacity-85",
                INSIGHT_FILL.strong,
              )}
              style={{
                height: max > 0 ? `max(3px, ${(row.count / max) * 100}%)` : 0,
              }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="flex gap-1">
        {rows.map((row, index) => (
          <span
            key={row.month}
            className="text-muted-foreground min-w-0 flex-1 truncate text-center font-mono text-xs tabular-nums"
          >
            {index % labelEvery === 0 ? row.label : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{monthHeader}</th>
            <th scope="col">{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.month}>
              <th scope="row">{row.label}</th>
              <td>{format(row.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
