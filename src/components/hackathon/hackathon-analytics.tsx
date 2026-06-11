"use client";

// Organizer analytics card on the hackathon manage page (#165): the
// participation funnel (enrolled → teamed → on a submitted team) and the
// cumulative cell-completion buckets across all team grids. Pure presentation
// over hackathon.analytics — the page route + the procedure enforce the
// community owner/admin gate (ADR-0031).

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/** 0..1 (or null) → whole-percent bar value. */
function toPct(rate: number | null): number {
  return rate === null ? 0 : Math.round(rate * 100);
}

function StatRow({
  label,
  count,
  pct,
  detail,
}: {
  label: string;
  count: string;
  pct: number;
  detail?: string;
}) {
  return (
    <div>
      <div className="text-muted-foreground flex items-center justify-between font-mono text-xs">
        <span>{label}</span>
        <span>
          {count}
          {detail ? ` · ${detail}` : ""}
        </span>
      </div>
      <Progress value={pct} className="mt-1" />
    </div>
  );
}

export function HackathonAnalytics({
  challengeId,
  phase,
}: {
  challengeId: number;
  phase: "draft" | "live" | "locked" | "finalized";
}) {
  const t = useTranslations("hackathon");
  const isDraft = phase === "draft";
  const { data } = api.hackathon.analytics.useQuery(
    { challengeId },
    { enabled: !isDraft },
  );

  let body: React.ReactNode;
  if (isDraft) {
    body = (
      <p className="text-muted-foreground text-xs">{t("analyticsDraft")}</p>
    );
  } else if (!data) {
    body = (
      <p className="text-muted-foreground text-xs">{t("analyticsLoading")}</p>
    );
  } else if (data.funnel.enrolled.count === 0) {
    body = (
      <p className="text-muted-foreground text-xs">
        {t("analyticsNoEnrollments")}
      </p>
    );
  } else {
    const { funnel, teams, cells } = data;
    // Funnel bars share one scale: each stage as a share of all enrollments.
    const base = funnel.enrolled.count;
    body = (
      <>
        <div className="space-y-3">
          <h3 className="text-muted-foreground text-xs font-medium">
            {t("analyticsFunnel")}
          </h3>
          <StatRow
            label={t("analyticsEnrolled")}
            count={String(funnel.enrolled.count)}
            pct={100}
          />
          <StatRow
            label={t("analyticsTeamed")}
            count={String(funnel.teamed.count)}
            pct={toPct(base > 0 ? funnel.teamed.count / base : null)}
            detail={
              funnel.teamed.rate !== null
                ? t("analyticsRateOfEnrolled", {
                    rate: toPct(funnel.teamed.rate),
                  })
                : undefined
            }
          />
          <StatRow
            label={t("analyticsSubmitted")}
            count={String(funnel.submitted.count)}
            pct={toPct(base > 0 ? funnel.submitted.count / base : null)}
            detail={
              funnel.submitted.rate !== null
                ? t("analyticsRateOfTeamed", {
                    rate: toPct(funnel.submitted.rate),
                  })
                : undefined
            }
          />
          <p className="text-muted-foreground text-xs">
            {t("analyticsTeamsSubmitted", {
              submitted: teams.submitted,
              total: teams.total,
            })}
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-muted-foreground text-xs font-medium">
            {t("analyticsCells")}
          </h3>
          {cells.total === 0 ? (
            <p className="text-muted-foreground text-xs">
              {t("analyticsNoCells")}
            </p>
          ) : (
            <>
              <StatRow
                label={t("analyticsClaimed")}
                count={`${cells.claimed.count}/${cells.total}`}
                pct={toPct(cells.claimed.rate)}
                detail={`${toPct(cells.claimed.rate)}%`}
              />
              <StatRow
                label={t("analyticsReported")}
                count={`${cells.reported.count}/${cells.total}`}
                pct={toPct(cells.reported.rate)}
                detail={`${toPct(cells.reported.rate)}%`}
              />
              <StatRow
                label={t("analyticsVerified")}
                count={`${cells.verified.count}/${cells.total}`}
                pct={toPct(cells.verified.rate)}
                detail={`${toPct(cells.verified.rate)}%`}
              />
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <h2 className="text-sm font-medium">{t("analytics")}</h2>
      {body}
    </Card>
  );
}
