import { Link } from "@/i18n/navigation";

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
            click country → see operators
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
                <tr
                  key={r.country}
                  className="border-border hover:bg-muted/40 group cursor-pointer border-t transition"
                >
                  <td className="py-1.5 font-medium">
                    <Link
                      href={`/investigations/datacenters?country=${r.country}`}
                      className="block hover:underline"
                    >
                      {r.country}
                    </Link>
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/investigations/datacenters?country=${r.country}`}
                      className="block"
                    >
                      {r.operator_count}
                    </Link>
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/investigations/datacenters?country=${r.country}`}
                      className="block"
                    >
                      {r.top3_share}%
                    </Link>
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/investigations/datacenters?country=${r.country}`}
                      className="block"
                    >
                      {Math.round(r.hhi)}
                    </Link>
                  </td>
                  <td className="pl-3">
                    <Link
                      href={`/investigations/datacenters?country=${r.country}`}
                      className="block"
                    >
                      <span
                        className={`inline-block rounded ${band.color} px-1.5 py-0.5 text-[10px] text-white`}
                      >
                        {band.label}
                      </span>
                    </Link>
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
                className="border-b last:border-0"
              >
                <Link
                  href={`/investigations/datacenters/${d.datacenter_slug}`}
                  className="hover:bg-muted/40 -mx-2 flex items-start justify-between gap-2 rounded px-2 py-1.5 transition"
                >
                  <div className="flex-1">
                    <div className="font-medium hover:underline">
                      {d.datacenter_name}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {d.supplier_name} —{" "}
                      <span className="text-amber-600">
                        {d.categories} categories
                      </span>
                    </div>
                  </div>
                  <span className="text-muted-foreground text-xs">→</span>
                </Link>
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
