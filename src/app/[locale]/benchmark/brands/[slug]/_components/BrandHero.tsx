"use client";
import { Badge } from "@/components/ui/badge";

interface Props {
  brand: {
    canonicalName: string;
    website: string | null;
    aliases: string[];
    categoryIds: string[];
  };
  primaryCategoryId: string | null;
  categoriesById: Record<string, { slug: string; name: string }>;
  hero: {
    visibilityPct: number;
    deltaPct: number;
    totalMentions: number;
    totalRuns: number;
  };
  windowDays: 7 | 30 | 90;
  onWindowChange: (w: 7 | 30 | 90) => void;
}

export function BrandHero({
  brand,
  primaryCategoryId,
  categoriesById,
  hero,
  windowDays,
  onWindowChange,
}: Props) {
  const favicon = brand.website
    ? `https://www.google.com/s2/favicons?domain=${safeHost(brand.website)}&sz=64`
    : null;
  const deltaColor =
    hero.deltaPct > 0
      ? "text-green-600"
      : hero.deltaPct < 0
        ? "text-red-600"
        : "text-muted-foreground";

  return (
    <header className="flex flex-col gap-4 rounded-lg border p-5">
      <div className="flex items-start gap-4">
        {favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={favicon} alt="" className="h-12 w-12 rounded" />
        ) : (
          <div className="bg-muted flex h-12 w-12 items-center justify-center rounded text-lg font-semibold">
            {brand.canonicalName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">{brand.canonicalName}</h1>
          {brand.website && (
            <a
              href={brand.website}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-600 underline"
            >
              {brand.website}
            </a>
          )}
          <div className="flex flex-wrap gap-1 pt-1">
            {brand.categoryIds.map((id) => {
              const c = categoriesById[id];
              if (!c) return null;
              const isPrimary = id === primaryCategoryId;
              return (
                <Badge
                  key={id}
                  variant={isPrimary ? "default" : "secondary"}
                  title={isPrimary ? "Primary category" : undefined}
                >
                  {c.name}
                </Badge>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Visibility ({windowDays}d)
          </div>
          <div className="text-4xl font-semibold tabular-nums">
            {hero.visibilityPct.toFixed(1)}%
          </div>
          <div className={`text-sm ${deltaColor}`}>
            {hero.deltaPct >= 0 ? "+" : ""}
            {hero.deltaPct.toFixed(1)} pts vs prior window
          </div>
          <div className="text-muted-foreground text-xs">
            {hero.totalMentions.toLocaleString()} mentions /{" "}
            {hero.totalRuns.toLocaleString()} runs
          </div>
        </div>

        <div className="flex gap-1">
          {([7, 30, 90] as const).map((w) => (
            <button
              key={w}
              onClick={() => onWindowChange(w)}
              className={`rounded border px-3 py-1 text-sm ${
                w === windowDays ? "bg-primary text-primary-foreground" : ""
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
