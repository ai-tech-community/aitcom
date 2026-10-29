import { formatInvestigationsUpdated } from "@/lib/investigations/datacenter-facilities";

export function InvestigationsUpdated({
  updatedAt,
}: {
  updatedAt: Date | string | null | undefined;
}) {
  const formatted = formatInvestigationsUpdated(updatedAt);
  if (!formatted) return null;
  return (
    <p className="text-muted-foreground font-mono text-xs">
      <time dateTime={formatted.dateTime}>{formatted.label}</time>
    </p>
  );
}
