"use client";
import { api } from "@/trpc/react";

function FunnelBar({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-700">{label}</span>
        <span className="font-mono text-zinc-900">
          {count}{" "}
          <span className="text-muted-foreground text-xs">({pct}%)</span>
        </span>
      </div>
      <div className="bg-muted h-2 rounded">
        <div
          className="bg-primary h-2 rounded transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ActivationFunnel({ slug }: { slug: string }) {
  const { data, isLoading, error } = api.activation.funnel.useQuery({ slug });

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading activation funnel"
        className="h-24 animate-pulse rounded-lg border"
      />
    );
  }

  if (
    (error as { data?: { code?: string } } | null)?.data?.code === "FORBIDDEN"
  ) {
    return null;
  }

  if (!data) return null;

  return (
    <section aria-label="Activation funnel">
      <div className="rounded-lg border">
        <div className="border-b p-4">
          <h3 className="text-sm font-semibold">Activation funnel</h3>
          <p className="text-muted-foreground text-xs">
            Last 30 days · newcomers through each activation stage
          </p>
        </div>
        <div className="p-4">
          {data.cohortSize === 0 ? (
            <p className="text-muted-foreground text-center text-sm">
              No newcomers in the last 30 days
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <FunnelBar
                  label="Joined"
                  count={data.cohortSize}
                  total={data.cohortSize}
                />
                <FunnelBar
                  label="Contributed"
                  count={data.contributed}
                  total={data.cohortSize}
                />
                <FunnelBar
                  label="Got a response"
                  count={data.responded}
                  total={data.cohortSize}
                />
                <FunnelBar
                  label="Activated"
                  count={data.activated}
                  total={data.cohortSize}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Awaiting response: {data.byStage.awaiting_response} · Awaiting
                profile: {data.byStage.awaiting_profile} · Stalled:{" "}
                {data.byStage.stalled} · Un-activated:{" "}
                {data.byStage.unactivated}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
