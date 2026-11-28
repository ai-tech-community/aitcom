"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Check, X } from "lucide-react";
import { AitLogo } from "@/components/ait-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import type { HubMembershipSeed } from "@/server/better-auth/hub-session";
import { useShellUnread } from "./shell-unread";
import { shellIconButton } from "./shell-navigation";

export function usableMemberships(memberships: readonly HubMembershipSeed[]) {
  // The existing memberships reader demotes lapsed paid memberships.
  return memberships.filter((membership) => membership.status === "active");
}

function CommunitySwitcher({
  memberships,
  unreadCommunities,
  retryMemberships,
  activeSlug,
  onNavigate,
}: {
  memberships: readonly HubMembershipSeed[];
  unreadCommunities: ReadonlySet<string>;
  retryMemberships?: () => void;
  activeSlug?: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations("redesign.shell");
  const common = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const communities = usableMemberships(memberships);
  const ordered = [
    ...communities.filter(({ slug }) => slug !== activeSlug),
    ...communities.filter(({ slug }) => slug === activeSlug),
  ];

  useEffect(() => setOpen(false), [pathname]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t("seeAllCommunities")}
          className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset lg:min-h-8"
        >
          {t("seeAll")}
        </button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="top-[max(1rem,env(safe-area-inset-top))] max-h-[calc(100dvh-2rem)] translate-y-0 gap-0 overflow-y-auto p-0 motion-reduce:animate-none sm:top-[12vh]"
        onOpenAutoFocus={(event) => {
          if (retryMemberships) return;
          event.preventDefault();
          input.current?.focus();
        }}
      >
        <div className="border-border flex items-center justify-between gap-2 border-b px-4">
          <DialogTitle>{t("switchCommunity")}</DialogTitle>
          <DialogClose asChild>
            <Button
              variant="ghost"
              className={shellIconButton}
              aria-label={common("close")}
            >
              <X className="size-5" aria-hidden />
            </Button>
          </DialogClose>
        </div>
        {retryMemberships ? (
          <div role="status" className="px-4 pt-3 text-sm">
            <p>{common("errorTitle")}</p>
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={retryMemberships}
            >
              {common("retry")}
            </Button>
          </div>
        ) : (
          <Command className="bg-background h-auto rounded-none">
            <CommandInput
              ref={input}
              aria-label={t("searchCommunities")}
              placeholder={t("searchCommunities")}
              className="h-11 text-base sm:text-sm"
            />
            <CommandList className="max-h-[min(34dvh,20rem)] p-2">
              <CommandEmpty>
                {t(communities.length ? "noCommunityMatches" : "noMemberships")}
              </CommandEmpty>
              {ordered.map((item) => (
                <CommandItem
                  key={item.slug}
                  value={item.slug}
                  keywords={[item.name ?? item.slug]}
                  onSelect={() => {
                    setOpen(false);
                    onNavigate?.();
                    router.push(`/communities/${item.slug}`);
                  }}
                  className="data-[selected=true]:ring-foreground/70 min-h-11 cursor-pointer gap-3 px-2 py-2 ring-inset data-[selected=true]:ring-1"
                >
                  <CommunityMark
                    name={item.name ?? item.slug}
                    logoUrl={item.logoUrl}
                  />
                  <span className="min-w-0 flex-1 wrap-break-word">
                    {item.name ?? item.slug}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {item.slug !== activeSlug &&
                    unreadCommunities.has(item.slug) ? (
                      <>
                        <CommunityUnreadDot />
                        <span className="sr-only">{t("unreadCommunity")}</span>
                      </>
                    ) : null}
                    {item.slug === activeSlug ? (
                      <>
                        <Check className="size-4" aria-hidden />
                        <span className="sr-only">{t("currentCommunity")}</span>
                      </>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        )}
        <div className="border-border border-t p-2">
          <DialogClose asChild>
            <Link
              href="/"
              onNavigate={onNavigate}
              aria-current={
                !activeSlug && pathname === "/" ? "page" : undefined
              }
              className="border-border hover:bg-secondary focus-visible:ring-ring flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
              <AitLogo className="h-3.5 w-8" aria-hidden />
              <span className="flex-1">{t("hub")}</span>
              <ArrowUpRight
                className="text-muted-foreground size-4"
                aria-hidden
              />
            </Link>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CommunityUnreadDot() {
  return (
    <span
      aria-hidden
      className="bg-foreground size-1.5 shrink-0 rounded-full"
    />
  );
}

export function CommunityMark({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl?: string | null;
}) {
  return (
    <Avatar aria-hidden className="size-7 shrink-0 rounded-md">
      {logoUrl ? (
        <AvatarImage src={logoUrl} alt="" className="object-cover" />
      ) : null}
      <AvatarFallback className="bg-secondary text-foreground rounded-md text-xs font-medium">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function CommunitySwitchList({
  memberships,
  activeSlug,
  retryMemberships,
  onNavigate,
  inline = false,
  className,
}: {
  memberships: readonly HubMembershipSeed[];
  activeSlug?: string;
  retryMemberships?: () => void;
  onNavigate?: () => void;
  inline?: boolean;
  className?: string;
}) {
  const t = useTranslations("redesign.shell");
  const { communities } = useShellUnread();
  const usable = usableMemberships(memberships);
  const current = usable.find(({ slug }) => slug === activeSlug);
  const others = usable.filter(({ slug }) => slug !== activeSlug);
  const shortcuts = (current ? [current, ...others] : others).slice(
    0,
    inline ? 1 : 4,
  );

  const seeAll = (
    <CommunitySwitcher
      memberships={memberships}
      unreadCommunities={communities}
      activeSlug={activeSlug}
      retryMemberships={retryMemberships}
      onNavigate={onNavigate}
    />
  );

  return (
    <nav
      aria-label={t("myCommunities")}
      className={cn(
        inline ? "flex min-w-0 items-center gap-0.5" : "space-y-0.5",
        className,
      )}
    >
      {inline ? null : (
        <div className="flex min-w-0 items-center justify-between gap-1">
          <h2 className="text-muted-foreground px-2 text-xs font-medium">
            {t("myCommunities")}
          </h2>
          {seeAll}
        </div>
      )}
      {shortcuts.map(({ slug, name }) => {
        const label = name ?? slug;
        const selected = slug === activeSlug;
        const unread = !selected && communities.has(slug);
        const shortcut = (
          <Link
            key={slug}
            href={`/communities/${slug}`}
            aria-label={
              unread ? t("communityUnread", { name: label }) : undefined
            }
            aria-current={selected ? "location" : undefined}
            onNavigate={onNavigate}
            className="hover:bg-secondary focus-visible:ring-ring flex min-h-11 min-w-0 items-center gap-2 rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset lg:min-h-9"
          >
            <span
              className={cn(
                "min-w-0 flex-1",
                inline ? "truncate" : "wrap-break-word",
              )}
            >
              {label}
            </span>
            {selected ? (
              <Check className="size-4 shrink-0" aria-hidden />
            ) : null}
            {unread ? <CommunityUnreadDot /> : null}
          </Link>
        );
        return inline ? (
          <TooltipProvider key={slug}>
            <Tooltip>
              <TooltipTrigger asChild>{shortcut}</TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-64 wrap-break-word"
              >
                {label}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          shortcut
        );
      })}
      {inline ? seeAll : null}
    </nav>
  );
}
