"use client";

import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Lock, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  activeDestination,
  type ShellDestination,
  type ShellNavGroup,
} from "./navigation";

export const shellIconButton =
  "focus-visible:ring-ring hover:bg-secondary inline-flex size-11 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-inset";

export function ShellNavLink({
  item,
  active = false,
  onNavigate,
}: {
  item: ShellDestination;
  active?: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("redesign.shell");
  const Icon = item.icon;
  const unread = item.unread ?? 0;
  const status = [
    item.locked ? t("lockedRoom") : null,
    unread > 0 ? t("unread", { count: unread }) : null,
  ].filter(Boolean);

  return (
    <Link
      href={item.href}
      onNavigate={onNavigate}
      aria-label={
        status.length ? [item.label, ...status].join(", ") : undefined
      }
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-visible:ring-ring relative flex min-h-11 items-center gap-2.5 rounded-md px-3 py-1.5 text-sm leading-snug outline-none focus-visible:ring-2 focus-visible:ring-inset lg:min-h-8",
        active
          ? "bg-secondary text-foreground before:bg-foreground font-semibold before:absolute before:inset-y-1.5 before:left-0 before:w-px"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground font-medium",
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      <span className="min-w-0 flex-1 wrap-break-word">{item.label}</span>
      {item.locked ? <Lock className="size-3.5 shrink-0" aria-hidden /> : null}
      {unread > 0 ? (
        <span
          className="bg-foreground text-background rounded-sm px-1.5 py-0.5 font-mono text-xs leading-none tabular-nums"
          aria-hidden
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

export function ShellNavGroups({
  groups,
  onNavigate,
}: {
  groups: readonly ShellNavGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = activeDestination(
    pathname,
    groups.flatMap((group) => group.items),
  );
  const t = useTranslations("redesign.shell");

  return (
    <nav aria-label={t("hubNavigation")} className="space-y-5">
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <div key={group.label} className="space-y-1">
            <SectionLabel as="h3" bordered={false} className="px-3 pb-1">
              {group.label}
            </SectionLabel>
            {group.items.map((item) => (
              <ShellNavLink
                key={item.href}
                item={item}
                active={active?.href === item.href}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      <a
        href="https://github.com/ai-tech-community/aitcom"
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <ArrowUpRight className="size-4" aria-hidden />
        {t("source")}
      </a>
    </nav>
  );
}

export function ShellDrawer({
  trigger,
  title,
  children,
  side = "left",
}: {
  trigger: ReactElement;
  title: string;
  children: (close: () => void) => ReactNode;
  side?: "left" | "right";
}) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side={side}
        showCloseButton={false}
        aria-describedby={undefined}
        className="h-dvh w-[min(22rem,calc(100%-2rem))] gap-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] motion-reduce:animate-none motion-reduce:transition-none"
      >
        <div className="border-border flex shrink-0 items-center justify-between gap-2 border-b px-4 py-1">
          <SheetTitle>{title}</SheetTitle>
          <SheetClose asChild>
            <Button
              variant="ghost"
              className={shellIconButton}
              aria-label={t("close")}
            >
              <X className="size-5" aria-hidden />
            </Button>
          </SheetClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {children(() => setOpen(false))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
