import { useTranslations } from "next-intl";

export function ShellUnreadBadge({
  count,
  label,
}: {
  count: number;
  label: string;
}) {
  const t = useTranslations("redesign.shell");
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      data-shell-unread=""
      title={label}
      className="bg-secondary text-foreground inline-flex min-h-4 shrink-0 items-center justify-center rounded-sm px-1 text-xs leading-none font-medium whitespace-nowrap"
    >
      <span>
        {t.rich("unreadShort", {
          count: count > 99 ? "99+" : count,
          number: (value) => (
            <span className="font-mono tabular-nums">{value}</span>
          ),
        })}
      </span>
    </span>
  );
}
