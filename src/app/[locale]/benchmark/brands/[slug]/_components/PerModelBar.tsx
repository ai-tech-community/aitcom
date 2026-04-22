"use client";

interface Row {
  modelId: string;
  visibilityPct: number;
  mentionsCount: number;
}

interface Props {
  rows: Row[];
  activeModelId: string | null;
  onModelSelect: (modelId: string | null) => void;
}

export function PerModelBar({ rows, activeModelId, onModelSelect }: Props) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No model data yet.</p>;
  }
  const max = Math.max(...rows.map((r) => r.visibilityPct), 1);
  return (
    <div className="flex flex-col gap-2">
      {rows
        .slice()
        .sort((a, b) => b.visibilityPct - a.visibilityPct)
        .map((r) => {
          const isActive = r.modelId === activeModelId;
          return (
            <button
              key={r.modelId}
              onClick={() => onModelSelect(isActive ? null : r.modelId)}
              className={`hover:bg-muted flex items-center gap-3 rounded px-2 py-1 text-left text-sm ${
                isActive ? "bg-muted" : ""
              }`}
            >
              <span className="w-40 truncate font-mono text-xs">
                {r.modelId}
              </span>
              <div className="bg-muted relative h-4 flex-1 overflow-hidden rounded">
                <div
                  className="bg-primary absolute inset-y-0 left-0"
                  style={{ width: `${(r.visibilityPct / max) * 100}%` }}
                />
              </div>
              <span className="w-12 text-right tabular-nums">
                {r.visibilityPct.toFixed(1)}%
              </span>
            </button>
          );
        })}
    </div>
  );
}
