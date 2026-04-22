"use client";

interface Row {
  domain: string;
  count: number;
  lastSeenAt: string | Date;
}

export function CitationsPanel({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No citations captured for this brand yet.
      </p>
    );
  }
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.domain} className="flex items-center gap-3 text-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://www.google.com/s2/favicons?domain=${r.domain}&sz=32`}
            alt=""
            className="h-4 w-4"
          />
          <span className="w-40 truncate">{r.domain}</span>
          <div className="bg-muted relative h-3 flex-1 overflow-hidden rounded">
            <div
              className="bg-primary absolute inset-y-0 left-0"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
          <span className="w-10 text-right tabular-nums">{r.count}</span>
          <span className="text-muted-foreground w-24 text-right text-xs">
            {new Date(r.lastSeenAt).toLocaleDateString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
