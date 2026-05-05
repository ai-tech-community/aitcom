"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ManualRunForm } from "./manual-run-form";
import { AgentRunModal } from "./agent-run-modal";
import {
  ALL_FILTER_VALUE,
  BenchmarkAssignmentPanel,
  type LatestBenchmarkAssignment,
} from "./benchmark-assignment-panel";

export function RunPromptsTab() {
  const t = useTranslations("benchmark.runTab");
  const utils = api.useUtils();
  const retryExtraction = api.benchmark.retryRunExtraction.useMutation({
    onSuccess: () => utils.benchmark.listMySubmissions.invalidate(),
  });
  const categories = api.benchmark.listCategories.useQuery();
  const intents = api.benchmark.listIntents.useQuery();
  const [categoryId, setCategoryId] = useState<string>(ALL_FILTER_VALUE);
  const [intentId, setIntentId] = useState<string>(ALL_FILTER_VALUE);
  const [search, setSearch] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [manualFor, setManualFor] = useState<string | null>(null);
  const [agentFor, setAgentFor] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState<Record<string, boolean>>({});
  const [latestAssignment, setLatestAssignment] =
    useState<LatestBenchmarkAssignment | null>(null);

  const prompts = api.benchmark.listApprovedPrompts.useQuery({
    categoryId: categoryId === ALL_FILTER_VALUE ? undefined : categoryId,
    intentId: intentId === ALL_FILTER_VALUE ? undefined : intentId,
    search: search || undefined,
    tag: tagInput || undefined,
    page: 1,
    pageSize: 24,
  });
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
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-wrap gap-3">
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>All categories</SelectItem>
            {categories.data?.map((c) => (
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
            {intents.data?.map((i) => (
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
          className="w-64"
          placeholder="Filter by tag…"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
        />
      </div>

      <BenchmarkAssignmentPanel
        categories={categories.data}
        intents={intents.data}
        categoryId={categoryId}
        intentId={intentId}
        onAssignmentCreated={setLatestAssignment}
      />

      <ul className="grid gap-3 md:grid-cols-2">
        {prompts.data?.map((p) => (
          <li key={p.id} className="flex flex-col gap-3 rounded-md border p-4">
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
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setAgentFor(p.id)}>
                Run with my agent
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setManualFor((prev) => (prev === p.id ? null : p.id))
                }
              >
                Manual submit
              </Button>
            </div>
            {manualFor === p.id && (
              <ManualRunForm
                promptId={p.id}
                onDone={() => setManualFor(null)}
              />
            )}
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{t("myRecentRuns")}</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => mine.refetch()}
            disabled={mine.isFetching}
          >
            {mine.isFetching ? t("refreshing") : t("refresh")}
          </Button>
        </div>
        <ul className="flex flex-col divide-y rounded-md border text-sm">
          {mine.data?.runs.length === 0 && (
            <li className="text-muted-foreground p-3">{t("noRunsYet")}</li>
          )}
          {mine.data?.runs.map((r) => {
            const unresolved = r.mentionsTotal - r.mentionsResolved;
            const isActive =
              r.extractionStatus === "pending" ||
              r.extractionStatus === "processing";
            const canRetry =
              r.extractionStatus === "pending" ||
              r.extractionStatus === "failed";
            const statusClass =
              r.extractionStatus === "done"
                ? "text-emerald-600"
                : r.extractionStatus === "failed"
                  ? "text-red-600"
                  : "text-muted-foreground";
            return (
              <li key={r.id} className="flex flex-col gap-1 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 font-medium">{r.promptText}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    {canRetry && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => retryExtraction.mutate({ runId: r.id })}
                        disabled={
                          retryExtraction.isPending &&
                          retryExtraction.variables?.runId === r.id
                        }
                      >
                        {retryExtraction.isPending &&
                        retryExtraction.variables?.runId === r.id
                          ? t("retrying")
                          : t("retry")}
                      </Button>
                    )}
                    <span
                      className={`flex items-center gap-1.5 text-xs tracking-wide uppercase ${statusClass}`}
                    >
                      {isActive && (
                        <span
                          className="inline-block h-2 w-2 animate-pulse rounded-full bg-current"
                          aria-hidden
                        />
                      )}
                      {r.extractionStatus}
                    </span>
                  </div>
                </div>
                <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                  <span className="font-mono">
                    {r.modelProvider}/{r.modelId}
                  </span>
                  <span>
                    {new Date(
                      r.capturedAt as unknown as string,
                    ).toLocaleString()}
                  </span>
                  {isActive && <span>{t("processing")}</span>}
                  {r.extractionStatus === "failed" && (
                    <span>{t("failed")}</span>
                  )}
                  {r.extractionStatus === "done" && (
                    <span>
                      {r.mentionsTotal} mention
                      {r.mentionsTotal === 1 ? "" : "s"} · {r.mentionsResolved}{" "}
                      matched
                      {unresolved > 0 && ` · ${unresolved} in alias queue`}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setRawOpen((prev) => ({ ...prev, [r.id]: !prev[r.id] }))
                    }
                    className="underline-offset-2 hover:underline"
                  >
                    {rawOpen[r.id] ? t("hideRaw") : t("viewRaw")}
                  </button>
                </div>
                {rawOpen[r.id] && (
                  <pre className="bg-muted/40 mt-2 max-h-80 overflow-auto rounded p-3 text-xs whitespace-pre-wrap">
                    {r.rawAnswer}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {agentFor && (
        <AgentRunModal
          promptId={agentFor}
          assignmentId={
            latestAssignment?.promptIds.includes(agentFor)
              ? latestAssignment.assignmentId
              : undefined
          }
          onClose={() => setAgentFor(null)}
        />
      )}
    </div>
  );
}
