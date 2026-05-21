// Methodology / explainer page for the AIT Brand Benchmark.
// Single long page with sticky TOC. Plain-English tone; each section
// ends with a link to the relevant ADR for engineers who want the full
// reasoning. See ADR-0009 decision 3 and the 2026-05-19 plan, Step 2.

import Link from "next/link";
import {
  BENCHMARK_STAT_DEFINITIONS,
  type BenchmarkStatKey,
} from "@/lib/benchmark-stat-definitions";

const TOC: Array<{ id: string; label: string }> = [
  { id: "what", label: "What this benchmark is" },
  { id: "how-runs-become-metrics", label: "How runs become metrics" },
  { id: "stats", label: "Stats glossary" },
  { id: "slicing", label: "Why we slice by AI product + grounding" },
  { id: "trust", label: "Trust, weighting, and the surface threshold" },
  { id: "assignments", label: "Assignments" },
  { id: "contribute", label: "How to contribute" },
  { id: "faq", label: "FAQ" },
];

// Order stats follow on the page. Drives both the TOC sub-section and
// the rendered glossary.
const STAT_ORDER: BenchmarkStatKey[] = [
  "modelSurface",
  "visibility",
  "shareOfVoice",
  "avgRank",
  "sentiment",
  "citationRate",
  "coverage",
  "surfaceThreshold",
  "contributorWeight",
];

export default function BenchmarkAboutPage() {
  return (
    <main className="container mx-auto flex flex-col gap-6 p-6 md:flex-row md:gap-12">
      <nav
        aria-label="On this page"
        className="text-sm md:sticky md:top-6 md:h-fit md:w-56 md:shrink-0"
      >
        <p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
          On this page
        </p>
        <ul className="flex flex-col gap-1">
          {TOC.map((entry) => (
            <li key={entry.id}>
              <a
                href={`#${entry.id}`}
                className="text-muted-foreground hover:text-foreground"
              >
                {entry.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="prose prose-sm dark:prose-invert flex max-w-3xl flex-col gap-8">
        <header className="not-prose flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">
            How the AIT Brand Benchmark works
          </h1>
          <p className="text-muted-foreground">
            Community-built measurement of how AI products talk about brands.
            This page explains the data model, the metrics, and the trust
            mechanics in plain English.
          </p>
        </header>

        <section id="what" className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">What this benchmark is</h2>
          <p>
            The AIT Brand Benchmark is a community-built measurement of how
            different AI products surface brands when asked real-world
            questions. Contributors take an approved prompt (e.g.{" "}
            <em>&ldquo;best CRM for small teams&rdquo;</em>), run it in their
            own AI session — ChatGPT, Claude.ai, Gemini app, Perplexity, Kimi,
            or an MCP-driven agent — and submit the raw answer back. AIT
            collects and aggregates the answers into per-AI-product visibility
            metrics. AIT does not call model APIs directly; the community runs
            the prompts.
          </p>
          <p className="text-muted-foreground text-xs">
            Full reasoning:{" "}
            <Link
              href="https://github.com/anthropics/claude-code"
              className="underline"
            >
              ADR-0006
            </Link>
            .
          </p>
        </section>

        <section id="how-runs-become-metrics" className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">How runs become metrics</h2>
          <ol className="list-decimal pl-6">
            <li>
              A contributor picks an approved prompt and an AI product (e.g.
              ChatGPT with web search).
            </li>
            <li>
              They run the prompt in their own AI session and paste the raw
              answer back into AIT, along with the AI product they used.
            </li>
            <li>
              Each submission is stored as one <em>run</em> with a contributor
              weight stamped from the contributor&rsquo;s AIT profile.
            </li>
            <li>
              An extractor parses the answer text for brand mentions, ranks,
              sentiment, and citations.
            </li>
            <li>
              Once a (prompt, AI product) cell has at least 3 distinct
              contributors, the cell&rsquo;s headline metrics — visibility,
              share of voice, sentiment — become visible publicly. Below the
              threshold the individual runs are still visible on the run page;
              only the aggregated number is gated.
            </li>
          </ol>
        </section>

        <section id="stats" className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Stats glossary</h2>
          {STAT_ORDER.map((key) => {
            const def = BENCHMARK_STAT_DEFINITIONS[key];
            return (
              <div key={key} id={def.anchor} className="flex flex-col gap-1">
                <h3 className="text-base font-semibold">{def.label}</h3>
                <p>{def.shortDef}</p>
              </div>
            );
          })}
        </section>

        <section id="slicing" className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">
            Why we slice by AI product + grounding
          </h2>
          <p>
            Two ChatGPT runs with web search on vs off return wildly different
            brand answers for the same prompt. So we treat each
            <em> (AI product, grounding mode)</em> combination as its own slice
            — what we call a <em>model surface</em>. Same prompt, different
            surfaces is the comparison the benchmark exists to make. We do not
            average across surfaces; averaging would hide the very thing
            we&rsquo;re trying to measure.
          </p>
        </section>

        <section id="trust" className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">
            Trust, weighting, and the surface threshold
          </h2>
          <p>
            Per-run fabrication is undetectable in a community-submitted system.
            We tolerate that and rely on three things:
          </p>
          <ul className="list-disc pl-6">
            <li>
              <strong>Volume.</strong> Per-cell metrics aren&rsquo;t shown
              publicly until at least 3 distinct contributors have submitted
              runs for the same prompt on the same AI product.
            </li>
            <li>
              <strong>Inherited weight.</strong> Every run carries a numeric
              weight derived from the contributor&rsquo;s existing AIT standing
              — account age, badges, verified status — not from anything they do
              inside the benchmark. New accounts contribute lightly; long-
              standing community members count more.
            </li>
            <li>
              <strong>Visible provenance.</strong> Every run shows who submitted
              it and when. Outliers don&rsquo;t disappear; they sit next to the
              consensus.
            </li>
          </ul>
        </section>

        <section id="assignments" className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Assignments</h2>
          <p>
            An assignment is a curated bundle of prompts you can grab as a
            starting point. Grabbing one holds it for 7 days; you can release it
            any time. Nothing penalises you for not finishing — assignments are
            an affordance, not a queue the system processes.
          </p>
        </section>

        <section id="contribute" className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">How to contribute</h2>
          <p>
            Pick the AI product you use, browse prompts that need coverage on
            that surface, and submit one or more raw answers back. The form
            takes about 30 seconds per submission. You don&rsquo;t need an API
            key, an agent, or any special access — just the AI product session
            you already have.
          </p>
          <Link
            href="/benchmark/contribute"
            className="text-primary underline-offset-4 hover:underline"
          >
            Start contributing →
          </Link>
        </section>

        <section id="faq" className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">FAQ</h2>
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">
              Why doesn&rsquo;t my submitted run change the headline number?
            </h3>
            <p>
              Per-cell metrics only become public once at least 3 distinct
              contributors have submitted for that prompt on that AI product.
              Your run is stored, visible on the run page and your profile, and
              will count toward the aggregate once the cell crosses the
              threshold.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">
              How do I know if web search was on when I used ChatGPT?
            </h3>
            <p>
              If the answer contains clickable source links or citation chips,
              web search was on. Otherwise it was off.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">
              Can I submit the same prompt more than once?
            </h3>
            <p>
              Yes. LLMs are non-deterministic and AI products change over time —
              multiple runs from the same contributor on the same prompt are
              real evidence of drift. There is no per-day dedup.
            </p>
          </div>
        </section>
      </article>
    </main>
  );
}
