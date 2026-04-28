"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  ComposedChart,
  Line,
} from "recharts";

const POWER_COLORS: Record<string, string> = {
  "grid-mixed": "#94a3b8",
  gas: "#f59e0b",
  nuclear: "#8b5cf6",
  solar: "#fbbf24",
  wind: "#22d3ee",
  hydro: "#3b82f6",
  geothermal: "#ef4444",
  hybrid: "#10b981",
  unknown: "#475569",
};

export function PowerSourcePie({
  data,
}: {
  data: Array<{ source: string | null; count: number; mw: number }>;
}) {
  const rows = data.map((d) => ({
    name: d.source ?? "unknown",
    value: d.count,
    mw: Math.round(d.mw),
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          cx="40%"
          cy="50%"
          outerRadius={90}
          label
        >
          {rows.map((r, i) => (
            <Cell key={i} fill={POWER_COLORS[r.name] ?? "#64748b"} />
          ))}
        </Pie>
        <Tooltip />
        <Legend verticalAlign="middle" align="right" layout="vertical" />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CountryScatter({
  data,
}: {
  data: Array<{ country: string; count: number; mw: number }>;
}) {
  const rows = data.slice(0, 25).map((d) => ({
    country: d.country,
    facilities: d.count,
    mw: Math.round(d.mw),
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ top: 10, right: 16, bottom: 30, left: 0 }}>
        <XAxis
          type="number"
          dataKey="facilities"
          name="Facilities"
          tick={{ fontSize: 11 }}
          label={{
            value: "Facilities",
            position: "insideBottom",
            offset: -10,
            fontSize: 11,
          }}
        />
        <YAxis
          type="number"
          dataKey="mw"
          name="MW"
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) =>
            v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
          }
        />
        <ZAxis type="number" dataKey="facilities" range={[40, 400]} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload as {
              country: string;
              facilities: number;
              mw: number;
            };
            return (
              <div className="border-border bg-background rounded border px-2 py-1 text-xs shadow">
                <div className="font-semibold">{d.country}</div>
                <div>{d.facilities} facilities · {d.mw.toLocaleString()} MW</div>
              </div>
            );
          }}
        />
        <Scatter data={rows} fill="#3b82f6">
          {rows.map((r, i) => (
            <Cell key={i} fill="#3b82f6" />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

type PowerMixRow = {
  operatorSlug: string;
  operatorName: string;
  source: string | null;
  mw: number;
  count: number;
};

const POWER_KEYS = [
  "grid-mixed",
  "gas",
  "nuclear",
  "solar",
  "wind",
  "hydro",
  "geothermal",
  "hybrid",
  "unknown",
] as const;

export function OperatorPowerMixStack({ data }: { data: PowerMixRow[] }) {
  // Pivot: one row per operator with each power-source key as a column.
  const byOperator = new Map<
    string,
    { operator: string; total: number } & Record<string, number>
  >();
  for (const r of data) {
    const key = r.source ?? "unknown";
    const o =
      byOperator.get(r.operatorSlug) ??
      ({ operator: r.operatorName, total: 0 } as {
        operator: string;
        total: number;
      } & Record<string, number>);
    o[key] = (o[key] ?? 0) + Math.round(r.mw);
    o.total += Math.round(r.mw);
    byOperator.set(r.operatorSlug, o);
  }
  const rows = Array.from(byOperator.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((r) => {
      const out: Record<string, string | number> = { operator: r.operator };
      for (const k of POWER_KEYS) out[k] = r[k] ?? 0;
      return out;
    });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) =>
            v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
          }
        />
        <YAxis
          type="category"
          dataKey="operator"
          tick={{ fontSize: 11 }}
          width={120}
        />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {POWER_KEYS.map((k) => (
          <Bar
            key={k}
            dataKey={k}
            stackId="a"
            fill={POWER_COLORS[k] ?? "#64748b"}
            name={k}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AnnounceTrendChart({
  data,
}: {
  data: Array<{ year: number; announced: number; online: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data}>
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="announced" name="Announced" fill="#94a3b8" />
        <Line
          type="monotone"
          dataKey="online"
          name="Came online"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SupplierCategoryBar({
  data,
}: {
  data: Array<{
    category: string;
    count: number;
    uniqueSuppliers: number;
  }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical">
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis dataKey="category" type="category" tick={{ fontSize: 11 }} width={100} />
        <Tooltip />
        <Legend />
        <Bar dataKey="count" name="Links" fill="#0ea5e9" />
        <Bar
          dataKey="uniqueSuppliers"
          name="Unique companies"
          fill="#06b6d4"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
