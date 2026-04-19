import { formatDurationMinutes } from "@/lib/impact-display";

type AudienceBlocksProps = {
  labels: {
    visitorsTitle: string;
    visitorsDescription: string;
    membersTitle: string;
    membersDescription: string;
    sponsorsTitle: string;
    sponsorsDescription: string;
  };
  data: {
    visitors: {
      momentum: number;
      outcomes: number;
      weeklyActiveContributors: number;
      ideaToImplMedian: number | null;
    };
    members: {
      responseHealth: number | null;
      answeredThreads: number;
      personalityDistribution: Record<string, number>;
      learningLoopSignal: string;
    };
    sponsors: {
      deliveryRate: number;
      activeBuilders: number;
      reuseRatio: number;
      pairingDiversity: number;
    };
  };
};

function formatPersonalityDistribution(dist: Record<string, number>): string {
  const entries = Object.entries(dist)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  if (entries.length === 0) return "-";
  return entries
    .map(([label, value]) => `${label}: ${Math.round(value)}%`)
    .join(", ");
}

function LearningLoopLabel({ signal }: { signal: string }) {
  const normalized = signal.toLowerCase();
  if (normalized === "improving") {
    return <span className="text-green-600">Improving</span>;
  }
  if (normalized === "declining") {
    return <span className="text-red-600">Declining</span>;
  }
  return <span className="text-zinc-500">Stable</span>;
}

export function AudienceBlocks({ labels, data }: AudienceBlocksProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <article className="rounded-lg border border-zinc-200 bg-white/80 p-4">
        <h3 className="font-semibold text-zinc-900">{labels.visitorsTitle}</h3>
        <p className="mt-1 text-sm text-zinc-600">
          {labels.visitorsDescription}
        </p>
        <div className="mt-3 space-y-1 font-mono text-xs text-zinc-700">
          <p>Momentum: {data.visitors.momentum.toFixed(1)}%</p>
          <p>Outcomes: {data.visitors.outcomes}</p>
          <p>Weekly Active: {data.visitors.weeklyActiveContributors}</p>
          <p>
            Idea &rarr; Impl:{" "}
            {data.visitors.ideaToImplMedian === null
              ? "-"
              : `${data.visitors.ideaToImplMedian} days`}
          </p>
        </div>
      </article>
      <article className="rounded-lg border border-zinc-200 bg-white/80 p-4">
        <h3 className="font-semibold text-zinc-900">{labels.membersTitle}</h3>
        <p className="mt-1 text-sm text-zinc-600">
          {labels.membersDescription}
        </p>
        <div className="mt-3 space-y-1 font-mono text-xs text-zinc-700">
          <p>
            Response Health:{" "}
            {formatDurationMinutes(data.members.responseHealth)}
          </p>
          <p>Answered Threads: {data.members.answeredThreads}</p>
          <p>
            Personality Mix:{" "}
            {formatPersonalityDistribution(
              data.members.personalityDistribution,
            )}
          </p>
          <p>
            Learning Loop:{" "}
            <LearningLoopLabel signal={data.members.learningLoopSignal} />
          </p>
        </div>
      </article>
      <article className="rounded-lg border border-zinc-200 bg-white/80 p-4">
        <h3 className="font-semibold text-zinc-900">{labels.sponsorsTitle}</h3>
        <p className="mt-1 text-sm text-zinc-600">
          {labels.sponsorsDescription}
        </p>
        <div className="mt-3 space-y-1 font-mono text-xs text-zinc-700">
          <p>Delivery Rate: {data.sponsors.deliveryRate.toFixed(1)}%</p>
          <p>Active Builders: {data.sponsors.activeBuilders}</p>
          <p>Reuse Ratio: {data.sponsors.reuseRatio}%</p>
          <p>Pairing Diversity: {data.sponsors.pairingDiversity}</p>
        </div>
      </article>
    </section>
  );
}
