"use client";

import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Lock, X, type LucideIcon } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { ShellUnreadBadge } from "./unread-badge";
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

export const shellMobileButton =
  "focus-visible:ring-ring hover:bg-secondary flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-md p-1 text-center text-xs leading-tight font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset";
export const shellActiveTab =
  "bg-secondary font-semibold [&>[data-shell-nav-label]]:underline [&>[data-shell-nav-label]]:decoration-foreground [&>[data-shell-nav-label]]:underline-offset-4";

export function ShellMobileLabel({
  icon: Icon,
  label,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  badge?: ReactNode;
}) {
  return (
    <>
      <span className="inline-flex items-center gap-1">
        <Icon className="size-5 shrink-0" aria-hidden />
        {badge}
      </span>
      <span data-shell-nav-label="" className="max-w-full wrap-break-word">
        {label}
      </span>
    </>
  );
}

export function ShellMobileNav({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      className="border-border bg-background fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-1 border-t px-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {children}
    </nav>
  );
}

export function ShellNavLink({
  item,
  active = false,
  onNavigate,
  className,
}: {
  item: ShellDestination;
  active?: boolean;
  onNavigate?: () => void;
  className?: string;
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
        "focus-visible:ring-ring relative flex min-h-11 items-center gap-2.5 rounded-md px-3 py-1.5 text-sm leading-snug outline-none focus-visible:ring-2 focus-visible:ring-inset lg:min-h-9",
        active
          ? "bg-secondary text-foreground decoration-foreground font-semibold underline underline-offset-4"
          : "text-foreground/75 hover:bg-secondary/60 hover:text-foreground font-medium",
        className,
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      <span className="min-w-0 flex-1 wrap-break-word">{item.label}</span>
      {item.locked ? <Lock className="size-3.5 shrink-0" aria-hidden /> : null}
      <ShellUnreadBadge count={unread} />
    </Link>
  );
}

export function ShellNavGroups({
  groups,
  onNavigate,
  children,
}: {
  groups: readonly ShellNavGroup[];
  onNavigate?: () => void;
  children?: ReactNode;
}) {
  const pathname = usePathname();
  const active = activeDestination(
    pathname,
    groups.flatMap((group) => group.items),
  );
  const t = useTranslations("redesign.shell");

  return (
    <nav aria-label={t("hubNavigation")} className="space-y-4">
      {children}
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
  footer,
  side = "left",
}: {
  trigger: ReactElement;
  title: string;
  children: (close: () => void) => ReactNode;
  footer?: (close: () => void) => ReactNode;
  side?: "left" | "right";
}) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side={side}
        showCloseButton={false}
        aria-describedby={undefined}
        className="h-dvh w-full max-w-88 gap-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] motion-reduce:animate-none motion-reduce:transition-none"
      >
        <div className="border-border flex shrink-0 items-center justify-between gap-2 border-b px-4 py-1">
          <SheetTitle className="min-w-0 wrap-break-word">{title}</SheetTitle>
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
          {children(close)}
        </div>
        {footer ? (
          <div className="border-border shrink-0 space-y-1 border-t p-3">
            {footer(close)}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
