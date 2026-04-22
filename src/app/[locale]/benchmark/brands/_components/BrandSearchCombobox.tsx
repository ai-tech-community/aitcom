"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";

function useDebounced<T>(value: T, ms = 150): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function BrandSearchCombobox() {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 150);
  const results = api.benchmark.brands.search.useQuery(
    { q: debounced, limit: 10 },
    { enabled: debounced.length > 0 },
  );

  return (
    <div className="relative w-72">
      <input
        className="w-full rounded border px-3 py-2 text-sm"
        placeholder="Search brands…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {debounced.length > 0 && results.data && results.data.brands.length > 0 && (
        <ul className="bg-background absolute left-0 right-0 top-full z-10 max-h-80 overflow-auto rounded border shadow">
          {results.data.brands.map((b) => (
            <li key={b.id}>
              <Link
                href={`/benchmark/brands/${b.slug}`}
                className="hover:bg-muted block px-3 py-2 text-sm"
                onClick={() => setQ("")}
              >
                {b.canonicalName}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
