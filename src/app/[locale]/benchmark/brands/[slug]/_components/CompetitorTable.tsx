"use client";
import Link from "next/link";

interface Competitor {
  id: string;
  slug: string;
  canonical_name: string;
  visibility_pct: string | number;
  avg_rank: string | number | null;
  sent_pos: string | number;
}

export function CompetitorTable({
  competitors,
}: {
  competitors: Competitor[];
}) {
  if (competitors.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No competitors found in the same category yet.
      </p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-muted-foreground text-xs uppercase">
        <tr>
          <th className="py-2 text-left">Brand</th>
          <th className="py-2 text-right">Visibility</th>
          <th className="py-2 text-right">Avg rank</th>
          <th className="py-2 text-right">Positive %</th>
        </tr>
      </thead>
      <tbody>
        {competitors.map((c) => (
          <tr key={c.id} className="border-t">
            <td className="py-2">
              <Link
                href={`/benchmark/brands/${c.slug}`}
                className="hover:underline"
              >
                {c.canonical_name}
              </Link>
            </td>
            <td className="py-2 text-right tabular-nums">
              {Number(c.visibility_pct).toFixed(1)}%
            </td>
            <td className="py-2 text-right tabular-nums">
              {c.avg_rank ? Number(c.avg_rank).toFixed(1) : "—"}
            </td>
            <td className="py-2 text-right tabular-nums">
              {Number(c.sent_pos).toFixed(0)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
