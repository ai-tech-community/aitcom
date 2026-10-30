"use client";
import { HealthPulse } from "./health-pulse";
import { AtRiskList } from "./at-risk-list";
import { UnactivatedList } from "./unactivated-list";
import { ActivationFunnel } from "../activation/activation-funnel";
import { AwaitingResponseList } from "../activation/awaiting-response-list";

export function InsightsDashboard({ slug }: { slug: string }) {
  return (
    <div className="@container space-y-8 py-4">
      <HealthPulse slug={slug} />
      <ActivationFunnel slug={slug} />
      <div className="grid gap-6 @3xl:grid-cols-2">
        <AtRiskList slug={slug} />
        <UnactivatedList slug={slug} />
        <AwaitingResponseList slug={slug} />
      </div>
    </div>
  );
}
