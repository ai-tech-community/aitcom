import { getContributionMixWidths } from "@/lib/impact-display";

type TrendPanelsProps = {
  labels: {
    collaborationRateWeekly: string;
    contributionMix: string;
  };
  weeklyCollaboration: Array<{ label: string; value: number }>;
  contributionMix: Array<{
    label: string;
    aiOnly: number;
    humanOnly: number;
    collaborative: number;
  }>;
};

export function TrendPanels({
  labels,
  weeklyCollaboration,
  contributionMix,
}: TrendPanelsProps) {
  const maxCollab = Math.max(1, ...weeklyCollaboration.map((entry) => entry.value));
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-lg border border-zinc-200 bg-white/80 p-4">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-zinc-600">
          {labels.collaborationRateWeekly}
        </h3>
        {weeklyCollaboration.every((entry) => entry.value === 0) ? (
          <div className="mt-4 flex h-40 items-center justify-center">
            <p className="font-mono text-xs text-zinc-400">No collaboration data yet</p>
          </div>
        ) : (
          <div className="mt-4 flex h-40 items-end gap-2">
            {weeklyCollaboration.map((entry) => (
              <div key={entry.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="font-mono text-[9px] text-zinc-500">
                  {entry.value > 0 ? `${Math.round(entry.value)}%` : ""}
                </span>
                <div
                  className="w-full rounded-sm bg-zinc-900/70"
                  style={{
                    height: `${entry.value === 0 ? 0 : Math.max(10, (entry.value / maxCollab) * 100)}%`,
                  }}
                />
                <span className="font-mono text-[9px] uppercase text-zinc-500">
                  {entry.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="rounded-lg border border-zinc-200 bg-white/80 p-4">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-zinc-600">
          {labels.contributionMix}
        </h3>
        <div className="mt-4 space-y-2">
          {contributionMix.map((entry) => {
            const total = Math.max(1, entry.aiOnly + entry.humanOnly + entry.collaborative);
            const widths = getContributionMixWidths(entry);
            return (
              <div key={entry.label}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase text-zinc-500">{entry.label}</span>
                  <span className="font-mono text-[10px] text-zinc-500">{total}</span>
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="bg-amber-500"
                    style={{ width: `${widths.aiOnly}%` }}
                  />
                  <div
                    className="bg-zinc-500"
                    style={{ width: `${widths.humanOnly}%` }}
                  />
                  <div
                    className="bg-emerald-600"
                    style={{ width: `${widths.collaborative}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}
