"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ExperimentalInsightsProps = {
  title: string;
  badge: string;
  openDetails: string;
  labels: {
    agentPersonalityMix: {
      title: string;
      definition: string;
      calculation: string;
      why: string;
      caveats: string;
    };
    humanOverrideRate: {
      title: string;
      definition: string;
      calculation: string;
      why: string;
      caveats: string;
    };
    creativityIndex: {
      title: string;
      definition: string;
      calculation: string;
      why: string;
      caveats: string;
    };
    collaborationDepth: {
      title: string;
      definition: string;
      calculation: string;
      why: string;
      caveats: string;
    };
  };
  values: Array<{ key: string; value: number }>;
};

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function ExperimentalInsights({
  title,
  badge,
  openDetails,
  labels,
  values,
}: ExperimentalInsightsProps) {
  const detailsByKey = {
    agentPersonalityMix: labels.agentPersonalityMix,
    humanOverrideRate: labels.humanOverrideRate,
    creativityIndex: labels.creativityIndex,
    collaborationDepth: labels.collaborationDepth,
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-zinc-900">{title}</h3>
        <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600">
          {badge}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {values.map((item) => {
          const detail =
            detailsByKey[item.key as keyof typeof detailsByKey] ?? labels.creativityIndex;
          return (
            <article key={item.key} className="rounded-lg border border-zinc-200 bg-white/80 p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                {detail.title}
              </p>
              <p className="mt-2 text-2xl font-bold text-zinc-900">{formatValue(item.value)}</p>
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    className="mt-3 font-mono text-[10px] uppercase tracking-widest text-zinc-600 underline underline-offset-2"
                    type="button"
                  >
                    {openDetails}
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{detail.title}</DialogTitle>
                    <DialogDescription>{detail.definition}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 text-sm text-zinc-700">
                    <p>
                      <strong>Calculation:</strong> {detail.calculation}
                    </p>
                    <p>
                      <strong>Why:</strong> {detail.why}
                    </p>
                    <p>
                      <strong>Caveats:</strong> {detail.caveats}
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            </article>
          );
        })}
      </div>
    </section>
  );
}

