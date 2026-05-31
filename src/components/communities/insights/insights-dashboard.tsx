"use client";
import { HealthPulse } from "./health-pulse";
import { AtRiskList } from "./at-risk-list";
import { UnactivatedList } from "./unactivated-list";
import { ActivationFunnel } from "../activation/activation-funnel";

export function InsightsDashboard({ slug }: { slug: string }) {
  return (
    <div className="space-y-8 py-4">
      <HealthPulse slug={slug} />
      <ActivationFunnel slug={slug} />
      <div className="grid gap-6 lg:grid-cols-2">
        <AtRiskList slug={slug} />
        <UnactivatedList slug={slug} />
      </div>
    </div>
  );
}
