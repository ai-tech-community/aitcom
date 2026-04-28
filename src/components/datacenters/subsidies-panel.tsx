type SubsidyRow = {
  id: string;
  kind: string;
  awardedBy: string;
  jurisdiction: string;
  amountUsd: number | null;
  announcedDate: string | null;
  effectiveDate: string | null;
  termYears: number | null;
  claimedJobs: number | null;
  claimedCapexUsd: number | null;
  verified: boolean;
};

export function SubsidiesPanel({ data }: { data: SubsidyRow[] }) {
  if (data.length === 0) {
    return (
      <div className="border-border/60 rounded border border-dashed p-3">
        <p className="text-muted-foreground text-xs">
          No subsidies, tax abatements, or public incentives recorded for this
          facility yet.
        </p>
      </div>
    );
  }

  const total = data.reduce((s, r) => s + (Number(r.amountUsd) || 0), 0);
  const totalJobs = data.reduce((s, r) => s + (r.claimedJobs ?? 0), 0);
  const perJob =
    totalJobs > 0 ? Math.round(total / totalJobs) : null;

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
        <Stat label="Total disclosed" value={`$${(total / 1e6).toFixed(1)}M`} />
        <Stat
          label="Claimed jobs"
          value={totalJobs > 0 ? totalJobs.toLocaleString() : "—"}
        />
        <Stat
          label="$/job claimed"
          value={perJob != null ? `$${(perJob / 1000).toFixed(0)}k` : "—"}
        />
      </div>

      <ul className="space-y-2">
        {data.map((s) => (
          <li
            key={s.id}
            className="border-border flex flex-col gap-1 rounded border p-2 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-medium">{s.awardedBy}</span>
                <span className="text-muted-foreground ml-2 text-xs">
                  {s.jurisdiction} · {s.kind}
                </span>
              </div>
              {s.amountUsd != null && (
                <span className="font-semibold">
                  ${(Number(s.amountUsd) / 1e6).toFixed(1)}M
                </span>
              )}
            </div>
            <div className="text-muted-foreground text-xs">
              {s.announcedDate && <>announced {fmt(s.announcedDate)} · </>}
              {s.effectiveDate && <>effective {fmt(s.effectiveDate)} · </>}
              {s.termYears != null && <>{s.termYears}y term · </>}
              {s.claimedJobs != null && <>{s.claimedJobs} jobs claimed</>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border rounded border p-2">
      <div className="text-muted-foreground text-xs uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold">{value}</div>
    </div>
  );
}

function fmt(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return `${dt.getFullYear()}.${dt.getMonth() + 1}.${String(dt.getDate()).padStart(2, "0")}`;
}
