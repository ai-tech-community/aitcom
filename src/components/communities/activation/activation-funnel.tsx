"use client";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { ErrorState } from "@/components/ui/error-state";

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
        <span className="text-foreground font-medium">{label}</span>
        <span className="text-foreground font-mono">
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
  const t = useTranslations("communities.activation");
  const { data, isLoading, isError, error, refetch } =
    api.activation.funnel.useQuery({ slug });

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label={t("loading")}
        className="h-24 animate-pulse rounded-lg border"
      />
    );
  }

  if (
    (error as { data?: { code?: string } } | null)?.data?.code === "FORBIDDEN"
  ) {
    return null;
  }

  if (isError) {
    return <ErrorState onRetry={() => void refetch()} />;
  }

  if (!data) return null;

  return (
    <section aria-label={t("funnelAriaLabel")}>
      <div className="rounded-lg border">
        <div className="border-b p-4">
          <h3 className="text-sm font-semibold">{t("funnelTitle")}</h3>
          <p className="text-muted-foreground text-xs">{t("funnelSubtitle")}</p>
        </div>
        <div className="p-4">
          {data.cohortSize === 0 ? (
            <p className="text-muted-foreground text-center text-sm">
              {t("funnelEmpty")}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <FunnelBar
                  label={t("funnelJoined")}
                  count={data.cohortSize}
                  total={data.cohortSize}
                />
                <FunnelBar
                  label={t("funnelContributed")}
                  count={data.contributed}
                  total={data.cohortSize}
                />
                <FunnelBar
                  label={t("funnelGotResponse")}
                  count={data.responded}
                  total={data.cohortSize}
                />
                <FunnelBar
                  label={t("funnelActivated")}
                  count={data.activated}
                  total={data.cohortSize}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {t("funnelByStage", {
                  awaiting_response: data.byStage.awaiting_response,
                  awaiting_profile: data.byStage.awaiting_profile,
                  stalled: data.byStage.stalled,
                  unactivated: data.byStage.unactivated,
                })}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
