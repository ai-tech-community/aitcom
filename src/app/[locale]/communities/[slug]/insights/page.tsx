"use client";

import { use } from "react";
import { InsightsDashboard } from "@/components/communities/insights/insights-dashboard";

export default function InsightsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <InsightsDashboard slug={slug} />;
}
