export function ShellUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      data-shell-unread=""
      className="bg-secondary text-foreground inline-flex min-h-4 min-w-4 shrink-0 items-center justify-center rounded-sm px-1 font-mono text-xs leading-none font-medium tabular-nums"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
