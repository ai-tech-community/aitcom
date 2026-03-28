type MethodologyPanelProps = {
  title: string;
  aggregateOnly: string;
  freshness: string;
  exclusions: string;
  lastUpdated: string;
};

export function MethodologyPanel({
  title,
  aggregateOnly,
  freshness,
  exclusions,
  lastUpdated,
}: MethodologyPanelProps) {
  return (
    <section id="methodology" className="rounded-lg border border-zinc-200 bg-white/80 p-4">
      <h3 className="font-semibold text-zinc-900">{title}</h3>
      <div className="mt-3 space-y-2 text-sm text-zinc-700">
        <p>{aggregateOnly}</p>
        <p>{freshness}</p>
        <p>{exclusions}</p>
        <p className="font-mono text-xs text-zinc-500">{lastUpdated}</p>
      </div>
    </section>
  );
}

