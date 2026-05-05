"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import { BrandHero } from "./_components/BrandHero";
import { PerModelBar } from "./_components/PerModelBar";
import { VisibilityTrendChart } from "./_components/VisibilityTrendChart";
import { CompetitorTable } from "./_components/CompetitorTable";
import { CitationsPanel } from "./_components/CitationsPanel";
import { TopPromptsPanel } from "./_components/TopPromptsPanel";
import { SentimentStacked } from "./_components/SentimentStacked";
import { SuggestPromptsModal } from "./_components/SuggestPromptsModal";
import { CountryPanel } from "./_components/CountryPanel";
import { StrategyPanel } from "./_components/StrategyPanel";
import { MetricCards } from "./_components/MetricCards";

const parseWindow = (v: string | null): 7 | 30 | 90 =>
  v === "7" || v === "90" ? (Number(v) as 7 | 90) : 30;

export default function BrandProfilePage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = use(params);
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const session = authClient.useSession();
  const isAuthenticated = !!session.data?.user;

  const windowDays = parseWindow(search.get("window"));
  const modelId = search.get("model");

  const setParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (value === null) sp.delete(key);
    else sp.set(key, value);
    router.replace(`${pathname}?${sp.toString()}`);
  };

  const stats = api.benchmark.brands.stats.useQuery({
    slug,
    window: windowDays,
    modelId: modelId ?? undefined,
  });

  const categories = api.benchmark.listCategories.useQuery();
  const categoriesById = Object.fromEntries(
    (categories.data ?? []).map((c) => [c.id, { slug: c.slug, name: c.name }]),
  );

  const legacyProfile = api.benchmark.getBrandProfile.useQuery({ slug });

  if (stats.isLoading) {
    return (
      <main className="container mx-auto p-6">
        <div className="bg-muted/50 h-40 w-full animate-pulse rounded" />
      </main>
    );
  }
  if (!stats.data) {
    return (
      <main className="container mx-auto flex flex-col gap-4 p-6">
        <Link
          href="/benchmark"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <p>Brand not found.</p>
      </main>
    );
  }

  const s = stats.data;
  const hasData = s.perModel.length > 0 && s.hero.totalMentions > 0;

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <Link
        href="/benchmark"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      <BrandHero
        brand={s.brand}
        primaryCategoryId={s.primaryCategoryId}
        categoriesById={categoriesById}
        hero={s.hero}
        windowDays={s.window}
        onWindowChange={(w) => setParam("window", String(w))}
        slug={slug}
        isAuthenticated={isAuthenticated}
      />

      <MetricCards summary={s.metricSummary} />

      {!hasData ? (
        <section className="rounded border p-6 text-center">
          <p className="font-medium">Not enough data yet.</p>
          <p className="text-muted-foreground text-sm">
            Contribute a run to help benchmark this brand.
          </p>
          <Link
            href={`/benchmark?tab=run&promptBrand=${s.brand.slug}`}
            className="text-primary mt-2 inline-block underline"
          >
            Contribute a run →
          </Link>
          <div className="mt-2">
            <SuggestPromptsModal
              brandSlug={s.brand.slug}
              brandName={s.brand.canonicalName}
            />
          </div>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Per model</h2>
            <PerModelBar
              rows={s.perModel}
              activeModelId={modelId}
              onModelSelect={(id) => setParam("model", id)}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Trend ({s.window}d)</h2>
            <VisibilityTrendChart
              rows={s.trendDays}
              windowDays={s.window}
              activeModelId={modelId}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Competitors</h2>
            <CompetitorTable competitors={s.competitors as never} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Top citing sources</h2>
            <CitationsPanel
              rows={s.citations.map(
                (c: {
                  domain: string;
                  count: number | string;
                  lastSeenAt: Date | string;
                }) => ({
                  domain: c.domain,
                  count: Number(c.count),
                  lastSeenAt: c.lastSeenAt,
                }),
              )}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Top prompts</h2>
            <TopPromptsPanel rows={s.topPrompts as never} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Sentiment</h2>
            <SentimentStacked
              pos={
                s.perModel.reduce(
                  (a, r) => a + r.sentimentPosPct * r.mentionsCount,
                  0,
                ) / Math.max(s.hero.totalMentions, 1)
              }
              neu={
                s.perModel.reduce(
                  (a, r) => a + r.sentimentNeuPct * r.mentionsCount,
                  0,
                ) / Math.max(s.hero.totalMentions, 1)
              }
              neg={
                s.perModel.reduce(
                  (a, r) => a + r.sentimentNegPct * r.mentionsCount,
                  0,
                ) / Math.max(s.hero.totalMentions, 1)
              }
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">By country</h2>
            <CountryPanel rows={s.byCountry} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Strategy</h2>
            <StrategyPanel brandSlug={s.brand.slug} window={s.window} />
          </section>
        </>
      )}

      {s.brand.aliases.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Also known as</h2>
          <div className="flex flex-wrap gap-1">
            {s.brand.aliases.map((a) => (
              <Badge key={a} variant="secondary">
                {a}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Recent mentions</h2>
        {legacyProfile.data?.mentions.length ? (
          <ul className="flex flex-col gap-2">
            {legacyProfile.data.mentions.slice(0, 100).map((m, i) => (
              <li key={i} className="rounded border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">
                    {m.modelProvider}/{m.modelId}
                  </span>
                  <Badge
                    variant={
                      m.sentiment === "positive"
                        ? "default"
                        : m.sentiment === "negative"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {m.sentiment}
                  </Badge>
                </div>
                {m.context && (
                  <p className="text-muted-foreground pt-1">
                    &ldquo;{m.context}&rdquo;
                  </p>
                )}
                <span className="text-muted-foreground text-xs">
                  {new Date(m.capturedAt as unknown as string).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No mentions yet.</p>
        )}
      </section>
    </main>
  );
}
