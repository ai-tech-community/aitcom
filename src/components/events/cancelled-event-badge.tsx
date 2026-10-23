import { Badge } from "@/components/ui/badge";

/** The word a direct event link shows when the event was cancelled. */
export function CancelledEventBadge({ label }: { label: string }) {
  return <Badge variant="destructive">{label}</Badge>;
}
