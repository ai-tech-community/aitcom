"use client";
import { api } from "@/trpc/react";

function delta(now: number, prev: number) {
  if (prev === 0) return now === 0 ? "—" : "+∞";
  const pct = Math.round(((now - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

export function HealthPulse({ slug }: { slug: string }) {
  const { data, isLoading } = api.insights.healthPulse.useQuery({ slug });
  if (isLoading || !data) {
    return <div className="h-24 animate-pulse rounded-lg border" />;
  }
  const cards = [
    {
      label: "Active (14d)",
      value: data.activeNow,
      sub: delta(data.activeNow, data.activePrev),
    },
    { label: "New joins", value: data.newJoins, sub: "" },
    { label: "Departed", value: data.departures, sub: "" },
    {
      label: "Contributions",
      value: data.contributionCount,
      sub: delta(data.contributionCount, data.contributionPrev),
    },
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <article
          key={c.label}
          className="rounded-lg border border-zinc-200 bg-white/80 p-4"
        >
          <p className="font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
            {c.label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
            {c.value}
          </p>
          {c.sub ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {c.sub} vs prior
            </p>
          ) : null}
        </article>
      ))}
    </section>
  );
}
