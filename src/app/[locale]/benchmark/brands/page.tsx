"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/trpc/react";
import { Card } from "@/components/ui/card";

export default function BrandsDirectoryPage() {
  const [categorySlug, setCategorySlug] = useState<string | undefined>();
  const [sort, setSort] = useState<"visibility" | "alpha" | "recent">(
    "visibility",
  );
  const [includeUnverified, setIncludeUnverified] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();

  const categories = api.benchmark.listCategories.useQuery();
  const page = api.benchmark.brands.list.useQuery({
    categorySlug,
    sort,
    includeUnverified,
    cursor,
  });

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Brands</h1>

      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded border px-3 py-1 text-sm ${!categorySlug ? "bg-primary text-primary-foreground" : ""}`}
          onClick={() => {
            setCategorySlug(undefined);
            setCursor(undefined);
          }}
        >
          All
        </button>
        {(categories.data ?? []).map((c) => (
          <button
            key={c.id}
            className={`rounded border px-3 py-1 text-sm ${c.slug === categorySlug ? "bg-primary text-primary-foreground" : ""}`}
            onClick={() => {
              setCategorySlug(c.slug);
              setCursor(undefined);
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          Sort
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as typeof sort);
              setCursor(undefined);
            }}
            className="rounded border px-2 py-1"
          >
            <option value="visibility">Visibility</option>
            <option value="alpha">Alphabetical</option>
            <option value="recent">Recently active</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeUnverified}
            onChange={(e) => {
              setIncludeUnverified(e.target.checked);
              setCursor(undefined);
            }}
          />
          Include unverified
        </label>
      </div>

      {page.isLoading ? (
        <div className="bg-muted/50 h-40 w-full animate-pulse rounded" />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(page.data?.brands ?? []).map((b) => (
            <Link key={b.id} href={`/benchmark/brands/${b.slug}`}>
              <Card className="flex flex-col gap-1 p-3 transition-shadow hover:shadow">
                <div className="truncate font-medium">{b.canonicalName}</div>
                <div className="text-muted-foreground text-xs">
                  {b.visibilityPct.toFixed(1)}% visibility · {b.mentions} mentions
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {page.data?.nextCursor && (
        <button
          className="self-center rounded border px-3 py-1 text-sm"
          onClick={() => setCursor(page.data.nextCursor)}
        >
          Load more
        </button>
      )}

      {page.data?.brands.length === 0 && !page.isLoading && (
        <p className="text-muted-foreground text-sm">No brands match the filters.</p>
      )}
    </main>
  );
}
