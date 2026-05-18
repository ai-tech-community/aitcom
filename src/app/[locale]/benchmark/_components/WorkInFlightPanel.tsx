"use client";

import { api } from "@/trpc/react";
import type { ModelSurface } from "@/server/db/schema";

const SURFACE_LABELS: Record<ModelSurface, string> = {
  chatgpt_grounded: "ChatGPT (grounded)",
  chatgpt_ungrounded: "ChatGPT (ungrounded)",
  claude_grounded: "Claude (grounded)",
  claude_ungrounded: "Claude (ungrounded)",
  gemini_grounded: "Gemini (grounded)",
  gemini_ungrounded: "Gemini (ungrounded)",
  perplexity: "Perplexity",
  kimi_grounded: "Kimi (grounded)",
  legacy_unverified: "Legacy (unverified)",
};

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function relativeFromNow(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(1, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function WorkInFlightPanel() {
  const query = api.benchmark.workInFlight.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  if (query.isLoading) {
    return (
      <section className="rounded-md border p-4">
        <p className="text-muted-foreground text-sm">Loading proxy status…</p>
      </section>
    );
  }

  const data = query.data;
  if (!data) return null;

  const surfaces = data.perSurface
    .filter((s) => s.surface !== "legacy_unverified")
    .sort((a, b) => a.surface.localeCompare(b.surface));

  return (
    <section className="flex flex-col gap-4 rounded-md border p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-lg font-medium">Proxy work in flight</h2>
          <p className="text-muted-foreground text-xs">
            AIT executes benchmark runs server-side. This panel shows what the
            proxy is doing right now and what landed today.
          </p>
        </div>
        <span className="text-muted-foreground text-xs">
          Refreshes every 30s · as of {new Date(data.asOf).toLocaleTimeString()}
        </span>
      </header>

      {surfaces.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No proxy activity yet today. Auto-seed runs when prompts are
          approved.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {surfaces.map((s) => (
            <div
              key={s.surface}
              className="flex flex-col gap-2 rounded border p-3"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium">
                  {SURFACE_LABELS[s.surface as ModelSurface] ?? s.surface}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatUsd(s.costCentsToday)} today
                </span>
              </div>
              <dl className="grid grid-cols-4 gap-1 text-center text-xs">
                <Stat label="queued" value={s.queued} />
                <Stat label="running" value={s.running} />
                <Stat label="done" value={s.doneToday} />
                <Stat
                  label="failed"
                  value={s.failedToday}
                  tone={s.failedToday > 0 ? "warn" : undefined}
                />
              </dl>
            </div>
          ))}
        </div>
      )}

      {data.recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Recent runs</h3>
          <ul className="flex flex-col divide-y rounded border text-xs">
            {data.recent.map((r) => (
              <li
                key={r.runId}
                className="flex items-center justify-between gap-3 p-2"
              >
                <span className="line-clamp-1 flex-1">{r.promptText}</span>
                <span className="text-muted-foreground shrink-0">
                  {SURFACE_LABELS[r.surface as ModelSurface] ?? r.surface}
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {relativeFromNow(
                    r.capturedAt as unknown as string,
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground tracking-wide uppercase">
        {label}
      </dt>
      <dd
        className={
          tone === "warn" && value > 0
            ? "font-medium text-amber-600 tabular-nums"
            : "tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}
