import { Lock } from "lucide-react";

/** Empty-state shown for a hub tab whose content is not yet available. */
export function LockedTabPanel({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <Lock className="text-muted-foreground size-6" aria-hidden />
      <p className="text-muted-foreground max-w-sm text-sm">{message}</p>
    </div>
  );
}
