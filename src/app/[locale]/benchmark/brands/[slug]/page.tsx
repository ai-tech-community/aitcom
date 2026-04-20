"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";

export default function BrandProfilePage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = use(params);
  const q = api.benchmark.getBrandProfile.useQuery({ slug });

  if (q.isLoading) return <main className="p-6">Loading…</main>;
  if (q.error) return <main className="p-6">Brand not found.</main>;

  const { brand, mentions } = q.data!;

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{brand.canonicalName}</h1>
        {brand.website && (
          <a className="text-sm text-blue-600 underline" href={brand.website} target="_blank" rel="noreferrer">
            {brand.website}
          </a>
        )}
        {brand.aliases.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {brand.aliases.map((a) => (<Badge key={a} variant="secondary">{a}</Badge>))}
          </div>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Recent mentions across models</h2>
        <ul className="flex flex-col gap-2">
          {mentions.map((m, i) => (
            <li key={i} className="flex flex-col gap-1 rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs">{m.modelProvider}/{m.modelId}</span>
                <Badge variant={
                  m.sentiment === "positive" ? "default"
                  : m.sentiment === "negative" ? "destructive"
                  : "secondary"
                }>{m.sentiment}</Badge>
              </div>
              {m.context && <p className="text-muted-foreground">"{m.context}"</p>}
              <span className="text-xs text-muted-foreground">
                {new Date(m.capturedAt as unknown as string).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
