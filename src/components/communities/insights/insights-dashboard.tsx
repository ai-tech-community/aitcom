"use client";
import { HealthPulse } from "./health-pulse";

export function InsightsDashboard({ slug }: { slug: string }) {
  return (
    <div className="space-y-8 py-4">
      <HealthPulse slug={slug} />
      {/* Task 10 will add: <AtRiskList slug={slug} /> + <UnactivatedList slug={slug} /> in a 2-col grid */}
    </div>
  );
}
