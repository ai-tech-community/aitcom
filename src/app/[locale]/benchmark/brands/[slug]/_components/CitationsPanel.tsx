"use client";

import { Badge } from "@/components/ui/badge";

type SourceType =
  | "owned-site"
  | "user-generated"
  | "reference"
  | "third-party"
  | "unknown";

interface Row {
  domain: string;
  count: number;
  lastSeenAt: string | Date;
  sourceType: SourceType;
  isOwned: boolean;
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
        <li key={r.domain} className="flex flex-col gap-1 rounded border p-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://www.google.com/s2/favicons?domain=${r.domain}&sz=32`}
              alt=""
              className="h-4 w-4 shrink-0"
            />
            <span className="min-w-0 flex-1 truncate font-medium">
              {r.domain}
            </span>
            <Badge variant="secondary" className="shrink-0">
              {sourceTypeLabel(r.sourceType)}
            </Badge>
            {r.isOwned && (
              <Badge variant="outline" className="shrink-0">
                owned
              </Badge>
            )}
            <span className="text-muted-foreground shrink-0 text-xs">
              {new Date(r.lastSeenAt).toLocaleDateString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-muted relative h-2 flex-1 overflow-hidden rounded">
              <div
                className="bg-primary absolute inset-y-0 left-0"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
            <span className="w-8 text-right text-sm tabular-nums">
              {r.count}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function sourceTypeLabel(sourceType: SourceType): string {
  switch (sourceType) {
    case "owned-site":
      return "owned site";
    case "user-generated":
      return "community";
    case "third-party":
      return "third party";
    case "reference":
      return "reference";
    case "unknown":
      return "unknown";
  }
}
