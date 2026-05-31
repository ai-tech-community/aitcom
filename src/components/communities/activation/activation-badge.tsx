import { Badge } from "@/components/ui/badge";
import type { ActivationStage } from "@/server/communities/activation";

const LABELS: Record<
  ActivationStage,
  {
    label: string;
    variant: "default" | "secondary" | "outline" | "destructive";
  }
> = {
  activated: { label: "Activated", variant: "default" },
  awaiting_response: { label: "Awaiting response", variant: "outline" },
  awaiting_profile: { label: "Awaiting profile", variant: "outline" },
  stalled: { label: "Stalled", variant: "destructive" },
  unactivated: { label: "Un-activated", variant: "secondary" },
};

export function ActivationBadge({ stage }: { stage: ActivationStage }) {
  const cfg = LABELS[stage];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
