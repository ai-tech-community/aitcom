"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ArrowLeftRight,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useShellUnread } from "./shell-unread";
import { shellIconButton } from "./shell-navigation";

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
  identity,
  triggerRef,
  iconOnly = false,
}: {
  memberships: readonly HubMembershipSeed[];
  retryMemberships?: () => void;
  signedIn: boolean;
  activeSlug?: string;
  onNavigate?: () => void;
  identity?: { name: string; logoUrl: string | null };
  triggerRef?: Ref<HTMLButtonElement>;
  iconOnly?: boolean;
}) {
  const t = useTranslations("redesign.shell");
  const common = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const communities = signedIn ? usableMemberships(memberships) : [];
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
          ref={triggerRef}
          aria-label={
            identity
              ? t("switchNamedCommunity", { name: identity.name })
              : t("switchCommunity")
          }
          title={t("switchCommunity")}
          className={cn(
            shellIconButton,
            iconOnly ? "lg:size-9" : "w-auto gap-2 px-2",
            identity && "min-w-11 justify-start text-left",
          )}
        >
          {iconOnly ? (
            <ArrowLeftRight className="size-4" aria-hidden />
          ) : identity ? (
            <>
              <CommunityMark name={identity.name} logoUrl={identity.logoUrl} />
              <ChevronDown
                className="text-muted-foreground size-3.5 shrink-0"
                aria-hidden
              />
            </>
          ) : (
            <>
              <AitLogo className="h-4 w-auto" aria-hidden />
              <ChevronDown
                className="text-muted-foreground size-3.5 shrink-0"
                aria-hidden
              />
            </>
          )}
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

export function CommunityShortcuts({
  memberships,
  activeSlug,
  onNavigate,
  limit = 3,
}: {
  memberships: readonly HubMembershipSeed[];
  activeSlug?: string;
  onNavigate?: () => void;
  limit?: number;
}) {
  const t = useTranslations("redesign.shell");
  const { communities } = useShellUnread();
  const shortcuts = usableMemberships(memberships)
    .filter(({ slug }) => slug !== activeSlug)
    .slice(0, limit);

  if (!shortcuts.length) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <nav aria-label={t("myCommunities")} className="flex items-center gap-1">
        {shortcuts.map(({ slug, name, logoUrl }) => {
          const label = name ?? slug;
          const unread = communities.has(slug);
          const accessibleLabel = unread
            ? t("communityUnread", { name: label })
            : label;
          return (
            <Tooltip key={slug}>
              <TooltipTrigger asChild>
                <Link
                  href={`/communities/${slug}`}
                  aria-label={accessibleLabel}
                  onNavigate={onNavigate}
                  className={cn(shellIconButton, "relative lg:size-9")}
                >
                  <CommunityMark name={label} logoUrl={logoUrl} />
                  {unread ? (
                    <span
                      aria-hidden
                      className="border-background bg-foreground absolute top-0.5 right-0.5 size-2.5 rounded-full border-2"
                    />
                  ) : null}
                </Link>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                sideOffset={5}
                className="motion-reduce:animate-none"
              >
                {accessibleLabel}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
