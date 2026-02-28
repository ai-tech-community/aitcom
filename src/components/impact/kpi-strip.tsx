type KpiStripProps = {
  labels: {
    totalContributions: string;
    aiAssisted: string;
    humanReviewedAi: string;
    collaborationRate: string;
    forumHelpfulness: string;
    medianFirstResponse: string;
    challengeParticipation: string;
    challengeCompletion: string;
    eventLinkedParticipation: string;
    collaborationGrowth4w: string;
  };
  values: {
    totalContributions: number;
    aiAssisted: number;
    humanReviewedAi: number;
    collaborationRate: number;
    forumHelpfulness: number;
    medianFirstResponse: number | null;
    challengeParticipationRate: number;
    challengeCompletionRate: number;
    eventLinkedParticipation: number;
    collaborationGrowth4w: number;
  };
};

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function KpiStrip({ labels, values }: KpiStripProps) {
  const cards = [
    { label: labels.totalContributions, value: String(values.totalContributions) },
    { label: labels.aiAssisted, value: String(values.aiAssisted) },
    { label: labels.humanReviewedAi, value: String(values.humanReviewedAi) },
    { label: labels.collaborationRate, value: formatPercent(values.collaborationRate) },
    { label: labels.forumHelpfulness, value: formatPercent(values.forumHelpfulness) },
    {
      label: labels.medianFirstResponse,
      value: values.medianFirstResponse === null ? "-" : `${values.medianFirstResponse}m`,
    },
    { label: labels.challengeParticipation, value: formatPercent(values.challengeParticipationRate) },
    { label: labels.challengeCompletion, value: formatPercent(values.challengeCompletionRate) },
    { label: labels.eventLinkedParticipation, value: String(values.eventLinkedParticipation) },
    {
      label: labels.collaborationGrowth4w,
      value: `${values.collaborationGrowth4w > 0 ? "+" : ""}${values.collaborationGrowth4w.toFixed(1)}%`,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <article key={card.label} className="rounded-lg border border-zinc-200 bg-white/80 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{card.label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">{card.value}</p>
        </article>
      ))}
    </section>
  );
}

