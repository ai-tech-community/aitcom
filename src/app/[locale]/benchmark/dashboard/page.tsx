// Legacy dashboard view. The old tab-based /benchmark?tab=dashboard
// redirects here. The page is kept reachable via the "Browse brands"
// card on the hub when contributors want the deeper charts; the
// brand directory at /benchmark/brands remains the primary browse
// surface per ADR-0009.

"use client";

import { useRouter } from "next/navigation";
import { DashboardTab } from "../_components/dashboard-tab";

export default function BenchmarkDashboardPage() {
  const router = useRouter();
  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <DashboardTab
        onChangeTab={(t) => {
          if (t === "run") router.push("/benchmark/contribute");
          else if (t === "submit") router.push("/benchmark/contribute");
          else router.push("/benchmark");
        }}
      />
    </main>
  );
}
