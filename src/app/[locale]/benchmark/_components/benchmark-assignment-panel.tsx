"use client";

import { useState } from "react";

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
  BENCHMARK_DEFAULT_LOCALE,
  BENCHMARK_MODEL_PROVIDERS,
  type BenchmarkModelProvider,
} from "@/lib/benchmark-constants";
import { api } from "@/trpc/react";

export const ALL_FILTER_VALUE = "__all__";
const ANY_PROVIDER_VALUE = "__any_provider__";

type FilterRow = {
  id: string;
  slug: string;
  name: string;
};

export type LatestBenchmarkAssignment = {
  assignmentId: string;
  promptIds: string[];
  promptCount: number;
  instructions: string;
  modelProvider: string | null;
  modelId: string | null;
  locale: string;
};

export type AgentRunSampleMetadata = {
  modelProvider?: string | null;
  modelId?: string | null;
  locale?: string | null;
};

export function buildAgentRunSampleValues(
  metadata: AgentRunSampleMetadata | undefined,
) {
  return {
    modelProvider: metadata?.modelProvider ?? "openai",
    modelId: metadata?.modelId ?? "gpt-5-pro",
    locale: metadata?.locale ?? BENCHMARK_DEFAULT_LOCALE,
  };
}

export function resolveSelectedSlug(
  rows: Array<{ id: string; slug: string }> | undefined,
  selectedId: string,
): string | undefined {
  if (selectedId === ALL_FILTER_VALUE) return undefined;
  return rows?.find((row) => row.id === selectedId)?.slug;
}

function selectedName(rows: FilterRow[] | undefined, selectedId: string) {
  if (selectedId === ALL_FILTER_VALUE) return undefined;
  return rows?.find((row) => row.id === selectedId)?.name;
}

function formatScope(
  categories: FilterRow[] | undefined,
  intents: FilterRow[] | undefined,
  categoryId: string,
  intentId: string,
) {
  const categoryName = selectedName(categories, categoryId);
  const intentName = selectedName(intents, intentId);

  if (categoryName && intentName) return `${categoryName} / ${intentName}`;
  if (categoryName) return categoryName;
  if (intentName) return intentName;
  return "all approved prompts";
}

export function BenchmarkAssignmentPanel({
  categories,
  intents,
  categoryId,
  intentId,
  onAssignmentCreated,
}: {
  categories: FilterRow[] | undefined;
  intents: FilterRow[] | undefined;
  categoryId: string;
  intentId: string;
  onAssignmentCreated?: (assignment: LatestBenchmarkAssignment) => void;
}) {
  const [modelProvider, setModelProvider] = useState(ANY_PROVIDER_VALUE);
  const [modelId, setModelId] = useState("");
  const [locale, setLocale] = useState(BENCHMARK_DEFAULT_LOCALE);
  const [latest, setLatest] = useState<LatestBenchmarkAssignment | null>(null);

  const createAssignment = api.benchmark.createAssignment.useMutation({
    onSuccess: (data) => {
      const assignment = {
        assignmentId: data.assignment.id,
        promptIds: data.prompts.map((prompt) => prompt.id),
        promptCount: data.prompts.length,
        instructions: data.instructions,
        modelProvider: data.assignment.modelProvider,
        modelId: data.assignment.modelId,
        locale: data.assignment.locale,
      };
      setLatest(assignment);
      onAssignmentCreated?.(assignment);
    },
  });

  const scope = formatScope(categories, intents, categoryId, intentId);
  const categorySlug = resolveSelectedSlug(categories, categoryId);
  const intentSlug = resolveSelectedSlug(intents, intentId);
  const trimmedModelId = modelId.trim();
  const trimmedLocale = locale.trim();
  const isResolvingSelectedFilters =
    (categoryId !== ALL_FILTER_VALUE && !categorySlug) ||
    (intentId !== ALL_FILTER_VALUE && !intentSlug);

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-medium">Agent assignment</h2>
          <p className="text-muted-foreground text-sm">
            Your agent runs these prompts and submits results through MCP.
          </p>
        </div>
        {latest && (
          <span className="bg-muted rounded px-2 py-1 text-xs">
            {latest.promptCount} prompt{latest.promptCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(9rem,13rem)_minmax(10rem,1fr)_minmax(7rem,9rem)_auto] sm:items-end">
        <div className="flex flex-col gap-1 text-sm">
          <label
            className="text-muted-foreground text-xs"
            htmlFor="benchmark-assignment-provider"
          >
            Provider
          </label>
          <Select value={modelProvider} onValueChange={setModelProvider}>
            <SelectTrigger
              id="benchmark-assignment-provider"
              className="w-full"
            >
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_PROVIDER_VALUE}>Any provider</SelectItem>
              {BENCHMARK_MODEL_PROVIDERS.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {provider}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label
          className="flex flex-col gap-1 text-sm"
          htmlFor="benchmark-assignment-model-id"
        >
          <span className="text-muted-foreground text-xs">Model id</span>
          <Input
            id="benchmark-assignment-model-id"
            placeholder="Optional model id"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
          />
        </label>

        <label
          className="flex flex-col gap-1 text-sm"
          htmlFor="benchmark-assignment-locale"
        >
          <span className="text-muted-foreground text-xs">Locale</span>
          <Input
            id="benchmark-assignment-locale"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            placeholder={BENCHMARK_DEFAULT_LOCALE}
          />
        </label>

        <Button
          type="button"
          onClick={() =>
            createAssignment.mutate({
              categorySlug,
              intentSlug,
              modelProvider:
                modelProvider === ANY_PROVIDER_VALUE
                  ? undefined
                  : (modelProvider as BenchmarkModelProvider),
              modelId: trimmedModelId || undefined,
              locale: trimmedLocale || BENCHMARK_DEFAULT_LOCALE,
            })
          }
          disabled={createAssignment.isPending || isResolvingSelectedFilters}
        >
          {createAssignment.isPending ? "Creating..." : `Create for ${scope}`}
        </Button>
      </div>

      {createAssignment.error && (
        <p className="text-destructive text-sm">
          {createAssignment.error.message}
        </p>
      )}

      {latest && (
        <div className="flex flex-col gap-2">
          <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
            <span>Assignment {latest.assignmentId}</span>
            <span>{latest.promptCount} prompts selected</span>
          </div>
          <pre className="bg-muted/40 max-h-72 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
            {latest.instructions}
          </pre>
        </div>
      )}
    </section>
  );
}
