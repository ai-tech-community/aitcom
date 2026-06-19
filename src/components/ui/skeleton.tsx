import { cn } from "@/lib/utils";

/**
 * Loading placeholder. Use for content-shaped loading (cards, rows, avatars) —
 * not a centered spinner. Honors prefers-reduced-motion (no pulse).
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "bg-muted animate-pulse rounded-md motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
