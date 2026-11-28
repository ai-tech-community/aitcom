import { cn } from "@/lib/utils";

export function EventDateBlock({
  dateTime,
  day,
  month,
  className,
}: {
  dateTime: string | null;
  day: string;
  month: string;
  className?: string;
}) {
  if (!dateTime) return null;
  return (
    <time
      dateTime={dateTime}
      className={cn(
        "border-border bg-secondary/45 flex w-14 flex-col items-center justify-center gap-1 self-start rounded-md border px-1 py-2.5 font-mono tabular-nums sm:w-17",
        className,
      )}
    >
      <span className="text-muted-foreground text-[11px] leading-none uppercase">
        {month}
      </span>
      <span className="text-2xl leading-none font-medium tracking-tight sm:text-3xl">
        {day}
      </span>
    </time>
  );
}
