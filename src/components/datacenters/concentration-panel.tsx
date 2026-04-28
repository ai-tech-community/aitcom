type ConcentrationRow = {
  country: string;
  total_mw: number;
  operator_count: number;
  hhi: number;
  top3_share: number;
};

type DepRow = {
  datacenter_slug: string;
  datacenter_name: string;
  supplier_name: string;
  categories: number;
};

function hhiBand(hhi: number): { label: string; color: string } {
  if (hhi >= 2500) return { label: "highly concentrated", color: "bg-red-600" };
  if (hhi >= 1500)
    return { label: "moderately concentrated", color: "bg-amber-500" };
  return { label: "competitive", color: "bg-green-600" };
}

export function ConcentrationPanel({
  data,
  dependency,
}: {
  data: ConcentrationRow[];
  dependency: DepRow[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="border-border rounded-lg border p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Operator concentration by country
          </h3>
          <span className="text-muted-foreground text-[10px]">
            HHI on operator MW shares
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-xs uppercase tracking-wider">
            <tr>
              <th className="pb-2 text-left">Country</th>
              <th className="pb-2 text-right">Operators</th>
              <th className="pb-2 text-right">Top-3 %</th>
              <th className="pb-2 text-right">HHI</th>
              <th className="pb-2 text-left pl-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 12).map((r) => {
              const band = hhiBand(r.hhi);
              return (
                <tr key={r.country} className="border-border border-t">
                  <td className="py-1.5 font-medium">{r.country}</td>
                  <td className="text-right">{r.operator_count}</td>
                  <td className="text-right">{r.top3_share}%</td>
                  <td className="text-right">{Math.round(r.hhi)}</td>
                  <td className="pl-3">
                    <span
                      className={`inline-block rounded ${band.color} px-1.5 py-0.5 text-[10px] text-white`}
                    >
                      {band.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-muted-foreground/70 mt-3 text-[10px]">
          HHI bands: &lt;1500 competitive, 1500–2500 moderate, ≥2500 high. US
          DOJ thresholds.
        </p>
      </div>

      <div className="border-border rounded-lg border p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Single-supplier dependency
          </h3>
          <span className="text-muted-foreground text-[10px]">
            ≥3 categories from one vendor
          </span>
        </div>
        {dependency.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No facilities meet the dependency threshold yet.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {dependency.slice(0, 12).map((d, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-2 border-b py-1.5 last:border-0"
              >
                <div className="flex-1">
                  <div className="font-medium">{d.datacenter_name}</div>
                  <div className="text-muted-foreground text-xs">
                    {d.supplier_name} —{" "}
                    <span className="text-amber-600">
                      {d.categories} categories
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground/70 mt-3 text-[10px]">
          Facilities where one supplier serves 3+ categories — potential
          single-point dependency.
        </p>
      </div>
    </div>
  );
}
