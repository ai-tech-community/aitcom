// Contributor flow under the BYOA model: surface-first, with held
// assignments floating above the explore list and a quick-start CTA
// for the picked surface's gap bundle.
//
// See ADR-0009 decision 2 and the 2026-05-19 plan, Step 5.

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LogIn } from "lucide-react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BENCHMARK_MODEL_SURFACES,
  BENCHMARK_MODEL_SURFACE_LABELS,
  type BenchmarkModelSurface,
} from "@/lib/benchmark-constants";
import { useStoredSurface } from "@/lib/use-stored-surface";
import { SurfacePicker } from "../_components/SurfacePicker";
import { PromptCoverageStrip } from "../_components/coverage-map";
import { ManualRunForm } from "../_components/manual-run-form";
import { AgentRunModal } from "../_components/agent-run-modal";

const ALL_FILTER_VALUE = "__all__";

export default function BenchmarkContributePage() {
  const router = useRouter();
  const params = useSearchParams();
  const session = authClient.useSession();
  const isAuthenticated = !!session.data?.user;
  const [surface, setSurface, hydrated] = useStoredSurface();
  const [changing, setChanging] = useState(false);

  // Honour ?surface=X and ?prompts=A,B from the brand-page CTA.
  const querySurface = params.get("surface");
  const queryPromptsRaw = params.get("prompts");
  const queryPrompts = useMemo(
    () =>
      queryPromptsRaw
        ? queryPromptsRaw.split(",").filter(Boolean)
        : [],
    [queryPromptsRaw],
  );

  useEffect(() => {
    if (!hydrated) return;
    if (
      querySurface &&
      (BENCHMARK_MODEL_SURFACES as readonly string[]).includes(querySurface) &&
      querySurface !== surface
    ) {
      setSurface(querySurface as BenchmarkModelSurface);
    }
  }, [hydrated, querySurface, surface, setSurface]);

  const [categoryId, setCategoryId] = useState<string>(ALL_FILTER_VALUE);
  const [intentId, setIntentId] = useState<string>(ALL_FILTER_VALUE);
  const [search, setSearch] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [manualFor, setManualFor] = useState<string | null>(null);
  const [agentFor, setAgentFor] = useState<string | null>(null);

  const categories = api.benchmark.listCategories.useQuery();
  const intents = api.benchmark.listIntents.useQuery();

  // Show the full SurfacePicker when no surface is stored or the
  // contributor clicked Change. Otherwise the picker is collapsed.
  const showPicker = hydrated && (surface === null || changing);

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <Link
        href="/benchmark"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Back to hub
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Help benchmark</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Pick the AI product you're running this in. We'll show you the
          prompts that need coverage on that surface. You paste the raw
          answer back — about 30 seconds per run.
        </p>
      </header>

      {showPicker ? (
        <section className="flex flex-col gap-3 rounded-md border p-4">
          <h2 className="font-medium">Which AI are you running this in?</h2>
          <SurfacePicker
            value={surface}
            onChange={(next) => {
              setSurface(next);
              setChanging(false);
            }}
          />
        </section>
      ) : (
        <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-md p-2 text-sm">
          <span className="text-muted-foreground">Running in:</span>
          <span className="font-medium">
            {surface && BENCHMARK_MODEL_SURFACE_LABELS[surface]}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setChanging(true)}
          >
            Change
          </Button>
        </div>
      )}

      {surface && !showPicker && (
        <ContributeBody
          surface={surface}
          isAuthenticated={isAuthenticated}
          queryPrompts={queryPrompts}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          intentId={intentId}
          setIntentId={setIntentId}
          search={search}
          setSearch={setSearch}
          tagInput={tagInput}
          setTagInput={setTagInput}
          manualFor={manualFor}
          setManualFor={setManualFor}
          agentFor={agentFor}
          setAgentFor={setAgentFor}
          categories={categories.data}
          intents={intents.data}
        />
      )}
    </main>
  );
}

function ContributeBody({
  surface,
  isAuthenticated,
  queryPrompts,
  categoryId,
  setCategoryId,
  intentId,
  setIntentId,
  search,
  setSearch,
  tagInput,
  setTagInput,
  manualFor,
  setManualFor,
  agentFor,
  setAgentFor,
  categories,
  intents,
}: {
  surface: BenchmarkModelSurface;
  isAuthenticated: boolean;
  queryPrompts: string[];
  categoryId: string;
  setCategoryId: (v: string) => void;
  intentId: string;
  setIntentId: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  tagInput: string;
  setTagInput: (v: string) => void;
  manualFor: string | null;
  setManualFor: (v: string | null) => void;
  agentFor: string | null;
  setAgentFor: (v: string | null) => void;
  categories: Array<{ id: string; name: string }> | undefined;
  intents: Array<{ id: string; name: string }> | undefined;
}) {
  const utils = api.useUtils();
  const surfaceLabel = BENCHMARK_MODEL_SURFACE_LABELS[surface];

  const mine = api.benchmark.listMyAssignments.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const myHeld = useMemo(
    () => (mine.data ?? []).filter((a) => a.status === "held"),
    [mine.data],
  );

  const open = api.benchmark.listOpenAssignments.useQuery(
    {},
    { enabled: isAuthenticated },
  );
  const matchingOpen = open.data?.bundles.find(
    (b) => b.modelSurface === surface,
  );

  const grab = api.benchmark.grabAssignment.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.benchmark.listOpenAssignments.invalidate(),
        utils.benchmark.listMyAssignments.invalidate(),
      ]);
    },
  });
  const release = api.benchmark.releaseAssignment.useMutation({
    onSuccess: async () => {
      await utils.benchmark.listMyAssignments.invalidate();
    },
  });

  const prompts = api.benchmark.listApprovedPrompts.useQuery({
    categoryId: categoryId === ALL_FILTER_VALUE ? undefined : categoryId,
    intentId: intentId === ALL_FILTER_VALUE ? undefined : intentId,
    search: search || undefined,
    tag: tagInput || undefined,
    page: 1,
    pageSize: 24,
  });
  const filteredPrompts = useMemo(() => {
    if (!prompts.data) return [];
    if (queryPrompts.length === 0) return prompts.data;
    const allow = new Set(queryPrompts);
    return prompts.data.filter((p) => allow.has(p.id));
  }, [prompts.data, queryPrompts]);
  const promptIds = filteredPrompts.map((p) => p.id);
  const coverage = api.benchmark.listPromptCoverage.useQuery(
    { promptIds, windowDays: 30 },
    { enabled: promptIds.length > 0 },
  );

  // Order prompts by gap size on the picked surface (lowest distinct
  // contributors first), so the most-helpful prompts surface first.
  const orderedPrompts = useMemo(() => {
    if (!coverage.data) return filteredPrompts;
    return [...filteredPrompts].sort((a, b) => {
      const ca = coverage.data.byPrompt[a.id]?.find(
        (c) => c.modelSurface === surface,
      );
      const cb = coverage.data.byPrompt[b.id]?.find(
        (c) => c.modelSurface === surface,
      );
      return (
        (ca?.distinctContributors ?? 0) - (cb?.distinctContributors ?? 0)
      );
    });
  }, [filteredPrompts, coverage.data, surface]);

  return (
    <>
      {!isAuthenticated && <SignInCard />}

      {isAuthenticated && myHeld.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Your held assignments</h2>
          <ul className="flex flex-col gap-2">
            {myHeld.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-1 rounded-md border p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {a.modelSurface
                      ? BENCHMARK_MODEL_SURFACE_LABELS[
                          a.modelSurface as BenchmarkModelSurface
                        ]
                      : "Any surface"}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={release.isPending}
                    onClick={() =>
                      release.mutate({ assignmentId: a.id })
                    }
                  >
                    Release
                  </Button>
                </div>
                <span className="text-muted-foreground text-xs">
                  {a.promptIds.length} prompt
                  {a.promptIds.length === 1 ? "" : "s"} ·{" "}
                  {a.expiresAt
                    ? `expires ${new Date(a.expiresAt as unknown as string).toLocaleDateString()}`
                    : "no expiry"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAuthenticated && matchingOpen && (
        <section className="bg-primary/5 flex flex-col gap-2 rounded-md border p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <h2 className="font-medium">
                Quick start: {matchingOpen.prompts.length} prompts on{" "}
                {surfaceLabel}
              </h2>
              <p className="text-muted-foreground text-sm">
                {matchingOpen.gapSummary}
              </p>
            </div>
            <Button
              disabled={grab.isPending}
              onClick={() =>
                grab.mutate({
                  modelSurface: matchingOpen.modelSurface,
                  promptIds: matchingOpen.promptIds,
                })
              }
            >
              Grab these prompts
            </Button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Prompts needing coverage on {surfaceLabel}</h2>
          {queryPrompts.length > 0 && (
            <Button size="sm" variant="outline" asChild>
              <Link href="/benchmark/contribute">Clear filter</Link>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All categories</SelectItem>
              {categories?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={intentId} onValueChange={setIntentId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All intents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All intents</SelectItem>
              {intents?.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            className="w-64"
            placeholder="Search prompts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Input
            className="w-48"
            placeholder="Filter by tag…"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
          />
        </div>

        <ul className="grid gap-3 md:grid-cols-2">
          {orderedPrompts.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-3 rounded-md border p-4"
            >
              <p className="leading-snug font-medium">{p.text}</p>
              {p.tags && p.tags.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {p.tags.map((t: string) => (
                    <span
                      key={t}
                      className="bg-muted rounded px-1.5 py-0.5 text-xs"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              )}
              <PromptCoverageStrip
                cells={coverage.data?.byPrompt[p.id]}
                threshold={coverage.data?.threshold ?? 3}
                onlySurface={surface}
              />
              <div className="flex gap-2">
                {isAuthenticated ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        setManualFor(manualFor === p.id ? null : p.id)
                      }
                    >
                      Submit a run
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAgentFor(p.id)}
                    >
                      Run with my agent
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" asChild>
                    <Link
                      href={`/auth/signin?redirect=${encodeURIComponent("/benchmark/contribute")}`}
                    >
                      <LogIn className="h-4 w-4" /> Sign in to submit
                    </Link>
                  </Button>
                )}
              </div>
              {isAuthenticated && manualFor === p.id && (
                <ManualRunForm
                  promptId={p.id}
                  initialSurface={surface}
                  onDone={() => setManualFor(null)}
                />
              )}
            </li>
          ))}
          {orderedPrompts.length === 0 && (
            <li className="text-muted-foreground col-span-full rounded-md border p-6 text-sm">
              No prompts match these filters.
            </li>
          )}
        </ul>
      </section>

      {isAuthenticated && (
        <section className="flex flex-col gap-2">
          <details>
            <summary className="text-muted-foreground cursor-pointer text-sm">
              My recent runs
            </summary>
            <MyRecentRuns />
          </details>
        </section>
      )}

      {agentFor && (
        <AgentRunModal
          promptId={agentFor}
          onClose={() => setAgentFor(null)}
        />
      )}
    </>
  );
}

function SignInCard() {
  return (
    <section className="bg-primary/5 border-primary/20 flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">Sign in to start submitting runs</h2>
        <p className="text-muted-foreground text-sm">
          You can browse the prompt list below without signing in. To grab an
          assignment, submit answers, or track your runs, sign in or create a
          free AIT account.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button asChild>
          <Link
            href={`/auth/signin?redirect=${encodeURIComponent("/benchmark/contribute")}`}
          >
            <LogIn className="h-4 w-4" /> Sign in
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link
            href={`/auth/signup?redirect=${encodeURIComponent("/benchmark/contribute")}`}
          >
            Create account
          </Link>
        </Button>
      </div>
    </section>
  );
}

function MyRecentRuns() {
  const mine = api.benchmark.listMySubmissions.useQuery(undefined, {
    refetchInterval: (query) => {
      const runs = query.state.data?.runs ?? [];
      const active = runs.some(
        (r) =>
          r.extractionStatus === "pending" ||
          r.extractionStatus === "processing",
      );
      return active ? 3000 : false;
    },
  });
  return (
    <ul className="mt-2 flex flex-col divide-y rounded-md border text-sm">
      {mine.data?.runs.length === 0 && (
        <li className="text-muted-foreground p-3">No runs yet.</li>
      )}
      {mine.data?.runs.slice(0, 20).map((r) => (
        <li key={r.id} className="flex flex-col gap-1 p-3">
          <span className="line-clamp-2 font-medium">{r.promptText}</span>
          <span className="text-muted-foreground text-xs">
            {r.modelProvider}
            {r.modelId ? ` / ${r.modelId}` : ""} ·{" "}
            {r.extractionStatus}
          </span>
        </li>
      ))}
    </ul>
  );
}
