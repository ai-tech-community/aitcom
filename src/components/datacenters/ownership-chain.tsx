type ChainNode = {
  id: string;
  slug: string;
  name: string;
  jurisdiction: string | null;
  entityType: string | null;
  ownershipPct: number | null;
  sourceUrl: string | null;
};

type Props = {
  chain: ChainNode[];
  depth: number;
  opacityScore: number;
  ultimateBeneficialOwner: string | null;
};

function opacityTone(score: number): { label: string; color: string } {
  if (score >= 70) return { label: "high opacity", color: "text-red-600" };
  if (score >= 50) return { label: "moderate", color: "text-amber-600" };
  if (score >= 30) return { label: "modest", color: "text-sky-600" };
  return { label: "transparent", color: "text-green-700" };
}

export function OwnershipChain({
  chain,
  depth,
  opacityScore,
  ultimateBeneficialOwner,
}: Props) {
  const tone = opacityTone(opacityScore);

  if (depth <= 1 && !ultimateBeneficialOwner) {
    return (
      <div className="border-border/60 rounded border border-dashed p-3">
        <p className="text-muted-foreground text-xs">
          No ownership chain tracked yet for this entity. Investigators can add
          parent companies via the ownership_edge table or community findings.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3 text-sm">
          <span>
            Ownership opacity:{" "}
            <span className={`font-semibold ${tone.color}`}>
              {opacityScore} / 100 — {tone.label}
            </span>
          </span>
          <span className="text-muted-foreground text-xs">
            {depth} layer{depth === 1 ? "" : "s"} traced
          </span>
        </div>
      </div>

      <ol className="space-y-1.5">
        {chain.map((c, i) => (
          <li
            key={c.id}
            className="border-border flex items-center gap-3 rounded border p-2 text-sm"
            style={{ marginLeft: `${i * 16}px` }}
          >
            <span className="text-muted-foreground text-xs">
              L{i}
              {i === 0 ? " (entity)" : i === chain.length - 1 ? " (top)" : ""}
            </span>
            <span className="flex-1 font-medium">{c.name}</span>
            {c.entityType && (
              <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                {c.entityType}
              </span>
            )}
            {c.jurisdiction && (
              <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                {c.jurisdiction}
              </span>
            )}
            {c.ownershipPct != null && (
              <span className="text-muted-foreground text-xs">
                {c.ownershipPct}%
              </span>
            )}
            {c.sourceUrl && (
              <a
                href={c.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground text-xs hover:underline"
              >
                src ↗
              </a>
            )}
          </li>
        ))}
      </ol>

      {ultimateBeneficialOwner && (
        <p className="text-muted-foreground mt-3 text-xs">
          UBO disclosed:{" "}
          <span className="font-medium">{ultimateBeneficialOwner}</span>
        </p>
      )}

      <p className="text-muted-foreground/70 mt-3 text-xs">
        Opacity score combines jurisdiction secrecy and chain depth (≥3 layers =
        +10, ≥4 = +20). Descriptive only — high opacity warrants review, not
        accusation.
      </p>
    </div>
  );
}
