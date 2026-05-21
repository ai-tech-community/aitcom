// AIT Brand Benchmark hub landing page. Three cards (Contribute,
// Browse, About) + a thin live-stats strip. See ADR-0009 decision 1.
//
// Legacy `?tab=` URLs from the old tabbed page redirect to the new
// routes. Kept here as a small client-side handler since the rest of
// the page is static.

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BarChart3, BookOpen, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/trpc/react";
import { BrandSearchCombobox } from "./brands/_components/BrandSearchCombobox";

export default function BenchmarkHubPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get("tab");
  const stats = api.benchmark.hubStats.useQuery();

  useEffect(() => {
    if (!tab) return;
    const targets: Record<string, string> = {
      run: "/benchmark/contribute",
      submit: "/benchmark/contribute",
      dashboard: "/benchmark/dashboard",
    };
    const target = targets[tab];
    if (target) router.replace(target);
    else {
      const q = new URLSearchParams(params.toString());
      q.delete("tab");
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
  }, [tab, router, params, pathname]);

  return (
    <main className="container mx-auto flex flex-col gap-8 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">AIT Brand Benchmark</h1>
          <p className="text-muted-foreground max-w-2xl">
            Community-built benchmark of how AI products surface brands.
            Contributors run prompts in their own ChatGPT, Claude, Gemini,
            Perplexity, or Kimi sessions and submit the answers; AIT aggregates
            them into per-product visibility metrics.
          </p>
        </div>
        <BrandSearchCombobox />
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <HubCard
          href="/benchmark/contribute"
          icon={<Sparkles className="h-6 w-6" aria-hidden />}
          title="Help benchmark"
          description="Pick the AI you use, grab a prompt that needs coverage, and paste the answer back. About 30 seconds per run."
          cta="Start contributing"
        />
        <HubCard
          href="/benchmark/brands"
          icon={<BarChart3 className="h-6 w-6" aria-hidden />}
          title="Browse brands"
          description="See how every tracked brand performs across ChatGPT, Claude, Gemini, Perplexity, and Kimi."
          cta="Browse the directory"
        />
        <HubCard
          href="/benchmark/about"
          icon={<BookOpen className="h-6 w-6" aria-hidden />}
          title="How it works"
          description="What we measure, how we measure it, what the stats mean, and how a community submission turns into a public metric."
          cta="Read the methodology"
        />
      </section>

      <section
        aria-label="Activity"
        className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm"
      >
        {stats.data ? (
          <>
            <span>
              <strong className="text-foreground">
                {stats.data.runsThisWeek}
              </strong>{" "}
              runs this week
            </span>
            <span aria-hidden>·</span>
            <span>
              <strong className="text-foreground">
                {stats.data.contributorsThisWeek}
              </strong>{" "}
              contributors
            </span>
            <span aria-hidden>·</span>
            <span>
              <strong className="text-foreground">
                {stats.data.brandsTracked}
              </strong>{" "}
              brands tracked
            </span>
          </>
        ) : (
          <span>Loading activity…</span>
        )}
      </section>
    </main>
  );
}

function HubCard({
  href,
  icon,
  title,
  description,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <Link href={href} className="group">
      <Card className="hover:border-foreground/30 flex h-full flex-col gap-3 p-5 transition-colors">
        <div className="text-primary">{icon}</div>
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
        <span className="text-primary mt-auto inline-flex items-center gap-1 text-sm font-medium">
          {cta}
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </Card>
    </Link>
  );
}
