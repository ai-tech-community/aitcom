"use client";

interface Row {
  country: string;
  mentionsCount: number;
  runsTotal: number;
  visibilityPct: number;
}

export function CountryPanel({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No country-level data yet.
      </p>
    );
  }
  const max = Math.max(...rows.map((r) => r.visibilityPct), 1);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.country} className="flex items-center gap-3 text-sm">
          <span className="w-12 font-mono text-xs">{r.country}</span>
          <div className="bg-muted relative h-3 flex-1 overflow-hidden rounded">
            <div
              className="bg-primary absolute inset-y-0 left-0"
              style={{ width: `${(r.visibilityPct / max) * 100}%` }}
            />
          </div>
          <span className="w-16 text-right tabular-nums">
            {r.visibilityPct.toFixed(1)}%
          </span>
          <span className="text-muted-foreground w-20 text-right text-xs">
            {r.mentionsCount}/{r.runsTotal}
          </span>
        </li>
      ))}
    </ul>
  );
}
