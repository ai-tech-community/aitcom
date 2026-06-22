import { cn } from "@/lib/utils";

/** Up to two initials from a space name — the auto-generated avatar's letter-mark. */
function spaceInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "#";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/**
 * Auto-generated avatar for a space/room — a monospace letter-mark on a neutral
 * tile, echoing the community wordmark ("A."). Identity comes from the letters,
 * not color: the chrome stays neutral per the One Voice / Chart-Containment
 * rules, so a directory of rooms never turns into confetti. Decorative — the
 * room name is the accessible label, so this is aria-hidden.
 */
export function SpaceAvatar({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const trimmed = name?.trim() ?? "";
  const label = trimmed.length > 0 ? trimmed : "Room";
  return (
    <div
      aria-hidden="true"
      className={cn(
        "border-border bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-medium tracking-tight uppercase select-none",
        className,
      )}
    >
      {spaceInitials(label)}
    </div>
  );
}
