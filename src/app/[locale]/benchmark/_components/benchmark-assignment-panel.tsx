"use client";

import { Button } from "@/components/ui/button";
import {
  BENCHMARK_DEFAULT_LOCALE,
  BENCHMARK_MODEL_SURFACE_LABELS,
  type BenchmarkModelSurface,
} from "@/lib/benchmark-constants";
import { api } from "@/trpc/react";

// Kept for backward compatibility with `run-prompts-tab.tsx` and
// the existing tests, even though create-assignment is no longer the
// primary flow under BYOA.
export const ALL_FILTER_VALUE = "__all__";

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

/**
 * BYOA assignment panel: shows open assignments (virtual pool of
 * under-covered cells) and the contributor's held assignments. There is
 * no claim-then-system-executes flow — the contributor runs the prompts
 * in their own AI product session and submits manually. Abandoning or
 * partially completing has no penalty (ADR-0008 Step 5).
 *
 * `categories` / `intents` / `categoryId` / `intentId` /
 * `onAssignmentCreated` are accepted for backward compatibility with
 * the surrounding tab but are not used by this version of the panel.
 */
export function BenchmarkAssignmentPanel(_props: {
  categories?: FilterRow[] | undefined;
  intents?: FilterRow[] | undefined;
  categoryId?: string;
  intentId?: string;
  onAssignmentCreated?: (assignment: LatestBenchmarkAssignment) => void;
}) {
  const utils = api.useUtils();
  const open = api.benchmark.listOpenAssignments.useQuery({});
  const mine = api.benchmark.listMyAssignments.useQuery();
  const myHeld = mine.data?.filter((a) => a.status === "held") ?? [];

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

  return (
    <section className="flex flex-col gap-4 rounded-md border p-4">
      <div>
        <h2 className="text-base font-medium">Assignments</h2>
        <p className="text-muted-foreground text-sm">
          You run these prompts in your own AI product session and paste
          the answers back. Grabbing an assignment holds it for 7 days;
          you can release it any time. Nothing penalises you for not
          finishing.
        </p>
      </div>

      {myHeld.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Your held assignments</h3>
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
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Open assignments</h3>
          {open.isFetching && (
            <span className="text-muted-foreground text-xs">Loading…</span>
          )}
        </div>
        {open.data?.bundles.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No gap cells right now — everything is covered. Browse the
            prompt list below to submit anyway.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {open.data?.bundles.map((b) => (
            <li
              key={b.pseudoId}
              className="flex flex-col gap-2 rounded-md border p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {BENCHMARK_MODEL_SURFACE_LABELS[b.modelSurface]}
                </span>
                <Button
                  size="sm"
                  disabled={grab.isPending}
                  onClick={() =>
                    grab.mutate({
                      modelSurface: b.modelSurface,
                      promptIds: b.promptIds,
                    })
                  }
                >
                  Grab
                </Button>
              </div>
              <span className="text-muted-foreground text-xs">
                {b.gapSummary}
              </span>
              <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
                {b.prompts.slice(0, 3).map((p) => (
                  <li key={p.id} className="truncate">
                    · {p.text}
                  </li>
                ))}
                {b.prompts.length > 3 && (
                  <li>+ {b.prompts.length - 3} more</li>
                )}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      {grab.error && (
        <p className="text-destructive text-sm">{grab.error.message}</p>
      )}
      {release.error && (
        <p className="text-destructive text-sm">{release.error.message}</p>
      )}
    </section>
  );
}
