"use client";

import { PromptFocusWidget } from "./widgets/prompt-focus";
import { ModelBiasMatrixWidget } from "./widgets/model-bias-matrix";
import { BrandTrendWidget } from "./widgets/brand-trend";
import { CategoryLeaderboardWidget } from "./widgets/category-leaderboard";
import { BrandSearchWidget } from "./widgets/brand-search";
import { LatestRunsFeedWidget } from "./widgets/latest-runs-feed";

export function DashboardTab() {
  return (
    <div className="grid gap-4 py-4 md:grid-cols-2">
      <PromptFocusWidget />
      <ModelBiasMatrixWidget />
      <BrandTrendWidget />
      <CategoryLeaderboardWidget />
      <BrandSearchWidget />
      <LatestRunsFeedWidget />
    </div>
  );
}
