type GreenwashRow = {
  operator_slug: string;
  operator_name: string;
  commitment_pct: number | null;
  target_year: number | null;
  source_url: string | null;
  total_mw: number;
  carbon_free_mw: number;
  carbon_free_pct: number;
  gap_pp: number | null;
};

function gapTone(gap: number | null): { label: string; color: string } {
  if (gap == null) return { label: "—", color: "bg-muted" };
  if (gap >= 50) return { label: "wide gap", color: "bg-red-600" };
  if (gap >= 20) return { label: "behind", color: "bg-amber-500" };
  if (gap >= 5) return { label: "close", color: "bg-sky-500" };
  return { label: "on track", color: "bg-green-600" };
}

export function GreenwashPanel({ data }: { data: GreenwashRow[] }) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No operators with public commitments tracked yet. Run{" "}
        <code className="bg-muted rounded px-1">pnpm commitments:seed</code>.
      </p>
    );
  }
  return (
    <div>
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-xs uppercase tracking-wider">
          <tr>
            <th className="pb-2 text-left">Operator</th>
            <th className="pb-2 text-right">Commitment</th>
            <th className="pb-2 text-right">By</th>
            <th className="pb-2 text-right">Actual carbon-free</th>
            <th className="pb-2 text-right">Gap</th>
            <th className="pb-2 pl-3 text-left">Status</th>
            <th className="pb-2 pl-2"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => {
            const tone = gapTone(r.gap_pp);
            return (
              <tr key={r.operator_slug} className="border-border border-t">
                <td className="py-1.5 font-medium">{r.operator_name}</td>
                <td className="text-right">
                  {r.commitment_pct != null ? `${r.commitment_pct}%` : "—"}
                </td>
                <td className="text-muted-foreground text-right">
                  {r.target_year ?? "—"}
                </td>
                <td className="text-right">{r.carbon_free_pct}%</td>
                <td className="text-right">
                  {r.gap_pp != null
                    ? r.gap_pp > 0
                      ? `+${r.gap_pp}pp`
                      : `${r.gap_pp}pp`
                    : "—"}
                </td>
                <td className="pl-3">
                  <span
                    className={`inline-block rounded ${tone.color} px-1.5 py-0.5 text-[10px] text-white`}
                  >
                    {tone.label}
                  </span>
                </td>
                <td className="pl-2">
                  {r.source_url && (
                    <a
                      href={r.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:underline text-xs"
                    >
                      src ↗
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-muted-foreground/70 mt-3 text-[10px]">
        Gap = commitment % − actual carbon-free MW % (solar/wind/hydro/geothermal/nuclear).
        Public commitments per operator press; actual derived from facility power-source field.
        Operator press claims and sourced facility data — community findings flow can dispute either side.
      </p>
    </div>
  );
}
