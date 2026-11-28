import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function ChromeUnreadCount({
  count,
  className,
  ...props
}: Omit<ComponentProps<"span">, "children"> & { count: number }) {
  return (
    <span
      data-chrome-unread-count=""
      className={cn(
        "bg-primary text-primary-foreground [body:has([data-community-first-week])_&]:bg-foreground [body:has([data-community-first-week])_&]:text-background flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold",
        className,
      )}
      {...props}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
