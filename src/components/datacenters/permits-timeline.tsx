type PermitRow = {
  id: string;
  kind: string;
  issuingBody: string;
  appliedDate: string | null;
  issuedDate: string | null;
  status: string;
  verified: boolean;
};

function lagDays(applied: string | null, issued: string | null): number | null {
  if (!applied || !issued) return null;
  const a = new Date(applied).getTime();
  const i = new Date(issued).getTime();
  if (isNaN(a) || isNaN(i)) return null;
  return Math.round((i - a) / 86_400_000);
}

function lagTone(d: number | null): string {
  if (d == null) return "text-muted-foreground";
  if (d < 14) return "text-red-600"; // unusually fast
  if (d < 60) return "text-amber-600";
  return "text-muted-foreground";
}

export function PermitsTimeline({ data }: { data: PermitRow[] }) {
  if (data.length === 0) {
    return (
      <div className="border-border/60 rounded border border-dashed p-3">
        <p className="text-muted-foreground text-xs">
          No permits tracked for this facility yet. Public records (county
          permits, environmental filings, grid interconnect filings) can be
          sourced via community findings.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {data.map((p) => {
        const lag = lagDays(p.appliedDate, p.issuedDate);
        return (
          <li
            key={p.id}
            className="border-border flex flex-col gap-1 rounded border p-2 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-medium capitalize">
                  {p.kind.replace(/-/g, " ")}
                </span>
                <span className="text-muted-foreground ml-2 text-xs">
                  {p.issuingBody}
                </span>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 text-xs text-white ${
                  p.status === "granted"
                    ? "bg-green-600"
                    : p.status === "denied"
                      ? "bg-red-600"
                      : p.status === "withdrawn"
                        ? "bg-muted-foreground"
                        : "bg-amber-500"
                }`}
              >
                {p.status}
              </span>
            </div>
            <div className="text-muted-foreground text-xs">
              {p.appliedDate && <>applied {fmt(p.appliedDate)} · </>}
              {p.issuedDate && <>issued {fmt(p.issuedDate)}</>}
              {lag != null && (
                <>
                  {" "}
                  ·{" "}
                  <span className={lagTone(lag)}>
                    {lag}d lag
                    {lag < 14 ? " (unusually fast)" : ""}
                  </span>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function fmt(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return `${dt.getFullYear()}.${dt.getMonth() + 1}.${String(dt.getDate()).padStart(2, "0")}`;
}
