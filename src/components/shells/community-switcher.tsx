"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowUpRight,
  Check,
  ChevronsUpDown,
  Compass,
  LayoutGrid,
  X,
} from "lucide-react";
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
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import type { HubMembershipSeed } from "@/server/better-auth/hub-session";
import { shellIconButton, ShellNavLink } from "./shell-navigation";

export function usableMemberships(memberships: readonly HubMembershipSeed[]) {
  // The existing memberships reader demotes lapsed paid memberships.
  return memberships.filter((membership) => membership.status === "active");
}

export function CommunitySwitcher({
  memberships,
  retryMemberships,
  signedIn,
  activeSlug,
  onNavigate,
  compact = false,
}: {
  memberships: readonly HubMembershipSeed[];
  retryMemberships?: () => void;
  signedIn: boolean;
  activeSlug?: string;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const t = useTranslations("redesign.shell");
  const common = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const communities = signedIn ? usableMemberships(memberships) : [];

  useEffect(() => setOpen(false), [pathname]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t("switchCommunity")}
          className={cn(
            "focus-visible:ring-ring hover:bg-secondary inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-inset",
            compact
              ? "px-2"
              : "border-border text-muted-foreground hover:text-foreground w-full justify-between border px-3 text-sm font-medium lg:min-h-9",
          )}
        >
          {compact ? (
            <AitLogo className="h-4 w-auto" aria-hidden />
          ) : (
            t("switchCommunity")
          )}
          <ChevronsUpDown className="size-3.5 shrink-0" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="top-[max(1rem,env(safe-area-inset-top))] max-h-[calc(100dvh-2rem)] translate-y-0 gap-0 overflow-y-auto p-0 motion-reduce:animate-none sm:top-[12vh]"
        onOpenAutoFocus={(event) => {
          if (!signedIn || retryMemberships) return;
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
        <div className="px-2 pt-2">
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
        {signedIn && retryMemberships ? (
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
        ) : signedIn ? (
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
              {communities.map((item) => (
                <CommandItem
                  key={item.slug}
                  value={item.slug}
                  keywords={[item.name ?? item.slug]}
                  onSelect={() => {
                    setOpen(false);
                    onNavigate?.();
                    router.push(`/communities/${item.slug}`);
                  }}
                  className="min-h-11 cursor-pointer gap-3 px-2 py-2"
                >
                  <Avatar aria-hidden className="size-7 rounded-sm">
                    {item.logoUrl ? (
                      <AvatarImage src={item.logoUrl} alt="" />
                    ) : null}
                    <AvatarFallback className="rounded-sm text-xs">
                      {getInitials(item.name ?? item.slug)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 wrap-break-word">
                    {item.name ?? item.slug}
                  </span>
                  {item.slug === activeSlug ? (
                    <>
                      <Check className="size-4" aria-hidden />
                      <span className="sr-only">{t("currentCommunity")}</span>
                    </>
                  ) : null}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        ) : null}
        <div className="border-border mt-2 border-t p-2">
          <ShellNavLink
            item={{ href: "/communities", label: t("discover"), icon: Compass }}
            onNavigate={() => {
              setOpen(false);
              onNavigate?.();
            }}
          />
          {signedIn ? (
            <ShellNavLink
              item={{
                href: "/dashboard/communities",
                label: t("myCommunities"),
                icon: LayoutGrid,
              }}
              onNavigate={() => {
                setOpen(false);
                onNavigate?.();
              }}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
