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
    };
    members: {
      responseHealth: number | null;
      answeredThreads: number;
    };
    sponsors: {
      deliveryRate: number;
      activeBuilders: number;
    };
  };
};

export function AudienceBlocks({ labels, data }: AudienceBlocksProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <article className="rounded-lg border border-zinc-200 bg-white/80 p-4">
        <h3 className="font-semibold text-zinc-900">{labels.visitorsTitle}</h3>
        <p className="mt-1 text-sm text-zinc-600">{labels.visitorsDescription}</p>
        <div className="mt-3 space-y-1 font-mono text-xs text-zinc-700">
          <p>Momentum: {data.visitors.momentum.toFixed(1)}%</p>
          <p>Outcomes: {data.visitors.outcomes}</p>
        </div>
      </article>
      <article className="rounded-lg border border-zinc-200 bg-white/80 p-4">
        <h3 className="font-semibold text-zinc-900">{labels.membersTitle}</h3>
        <p className="mt-1 text-sm text-zinc-600">{labels.membersDescription}</p>
        <div className="mt-3 space-y-1 font-mono text-xs text-zinc-700">
          <p>
            Response Health:{" "}
            {data.members.responseHealth === null ? "-" : `${data.members.responseHealth}m`}
          </p>
          <p>Answered Threads: {data.members.answeredThreads}</p>
        </div>
      </article>
      <article className="rounded-lg border border-zinc-200 bg-white/80 p-4">
        <h3 className="font-semibold text-zinc-900">{labels.sponsorsTitle}</h3>
        <p className="mt-1 text-sm text-zinc-600">{labels.sponsorsDescription}</p>
        <div className="mt-3 space-y-1 font-mono text-xs text-zinc-700">
          <p>Delivery Rate: {data.sponsors.deliveryRate.toFixed(1)}%</p>
          <p>Active Builders: {data.sponsors.activeBuilders}</p>
        </div>
      </article>
    </section>
  );
}

