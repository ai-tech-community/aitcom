import { Badge } from "@/components/ui/badge";

/** Shown only when the listing records AI use. Null and false stay blank. */
export function StartupUsesAiBadge({
  usesAi,
  label,
}: {
  usesAi: boolean | null | undefined;
  label: string;
}) {
  if (usesAi !== true) return null;
  return (
    <Badge variant="outline" data-startup-uses-ai="">
      {label}
    </Badge>
  );
}
