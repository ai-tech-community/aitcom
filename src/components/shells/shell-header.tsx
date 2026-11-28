"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { useCommandState } from "cmdk";
import {
  ChevronRight,
  Globe,
  LogOut,
  MessageSquare,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MessagesNavLink } from "@/components/inbox/messages-nav-link";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SectionLabel } from "@/components/ui/section-label";
import { Button } from "@/components/ui/button";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { getInitials } from "@/lib/avatar";
import { clearAllPostDrafts } from "@/lib/post-drafts";
import { cn } from "@/lib/utils";
import { authClient } from "@/server/better-auth/client";
import type { HubAuthUser } from "@/server/better-auth/hub-session";
import { JOIN_HREF, keyboardNavItems } from "@/components/site-nav";
import type { ShellDestination, ShellNavGroup } from "./navigation";
import { shellIconButton, ShellNavLink } from "./shell-navigation";

function PageFinderFooter() {
  const t = useTranslations("redesign.shell");
  const count = useCommandState((state) => state.filtered.count);
  return (
    <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t px-3 py-2 text-xs">
      <span aria-live="polite">{t("pageResults", { count })}</span>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <li>
          <kbd className="bg-secondary text-foreground mr-1 rounded px-1">
            ↑↓
          </kbd>
          {t("keysNavigate")}
        </li>
        <li>
          <kbd className="bg-secondary text-foreground mr-1 rounded px-1">
            {t("keyEnter")}
          </kbd>
          {t("keysOpen")}
        </li>
        <li>
          <kbd className="bg-secondary text-foreground mr-1 rounded px-1">
            {t("keyEscape")}
          </kbd>
          {t("keysClose")}
        </li>
      </ul>
    </div>
  );
}

function PageFinder({ groups }: { groups: readonly ShellNavGroup[] }) {
  const t = useTranslations("redesign.shell");
  const common = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pointerReturn = useRef(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (
          event.defaultPrevented ||
          (event.target instanceof HTMLElement &&
            event.target.closest("input, select, textarea, [contenteditable]"))
        )
          return;
        // Let the shell's own dialogs retain their focus trap.
        if (document.querySelector('[role="dialog"][data-state="open"]'))
          return;
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          ref={trigger}
          onBlur={(event) =>
            event.currentTarget.removeAttribute("data-pointer-return")
          }
          onKeyDown={(event) =>
            event.currentTarget.removeAttribute("data-pointer-return")
          }
          aria-label={t("findPage")}
          aria-keyshortcuts="Control+K Meta+K"
          title={t("findPage")}
          className={cn(
            shellIconButton,
            "text-muted-foreground hover:text-foreground data-[pointer-return]:focus-visible:ring-0 lg:w-auto lg:gap-2 lg:px-2.5",
          )}
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="hidden text-sm font-medium xl:inline">
            {t("findPage")}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        onPointerDownCapture={() => {
          pointerReturn.current = true;
        }}
        onPointerDownOutside={() => {
          pointerReturn.current = true;
        }}
        onKeyDownCapture={() => {
          pointerReturn.current = false;
        }}
        onEscapeKeyDown={() => {
          pointerReturn.current = false;
        }}
        onCloseAutoFocus={() => {
          if (pointerReturn.current)
            trigger.current?.setAttribute("data-pointer-return", "");
          pointerReturn.current = false;
        }}
        className="top-[max(1rem,env(safe-area-inset-top))] translate-y-0 gap-0 overflow-hidden p-0 motion-reduce:animate-none sm:top-[12vh]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
        }}
      >
        <div className="border-border flex items-center justify-between gap-2 border-b px-4">
          <DialogTitle>{t("findPage")}</DialogTitle>
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
        <DialogDescription className="sr-only">
          {t("findDescription")}
        </DialogDescription>
        <Command>
          <CommandInput
            ref={input}
            aria-label={t("findPage")}
            placeholder={t("findPlaceholder")}
            className="h-11 text-base sm:text-sm"
          />
          <CommandList className="max-h-[min(50dvh,23rem)] p-2 [scrollbar-width:thin]">
            <CommandEmpty>{t("noPages")}</CommandEmpty>
            {groups.map(({ label, items }) => (
              <CommandGroup key={label} heading={label}>
                {items.map((item) => (
                  <CommandItem
                    key={item.href}
                    value={item.href}
                    keywords={[item.label]}
                    onSelect={() => {
                      setOpen(false);
                      router.push(item.href);
                    }}
                    className="min-h-11 cursor-pointer px-2 py-2"
                  >
                    {item.icon ? <item.icon aria-hidden /> : null}
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <PageFinderFooter />
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function AccountMenu({
  user,
  links,
}: {
  user: HubAuthUser | null;
  links: readonly ShellDestination[];
}) {
  const t = useTranslations("redesign.shell");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const name =
    [user?.name?.trim(), user?.email].find((value) => value?.length) ??
    t("account");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={shellIconButton}
          aria-label={user ? t("account") : t("accountAndLanguage")}
          title={user ? t("account") : t("accountAndLanguage")}
        >
          {user ? (
            <Avatar className="size-7">
              {user.image ? <AvatarImage src={user.image} alt="" /> : null}
              <AvatarFallback className="bg-secondary text-foreground text-xs font-semibold">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <UserRound className="size-4" aria-hidden />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-(--radix-popover-content-available-height) w-[min(17rem,calc(100vw-1.5rem))] overflow-y-auto p-2 motion-reduce:animate-none"
        aria-label={t("accountAndLanguage")}
      >
        <SectionLabel bordered={false} className="px-3 pt-2 pb-1">
          {t("account")}
        </SectionLabel>
        {user ? (
          <p className="px-3 pb-2 text-sm font-semibold wrap-break-word">
            {name}
          </p>
        ) : null}
        {links.map((item) => (
          <ShellNavLink
            key={item.href}
            item={item}
            onNavigate={() => setOpen(false)}
          />
        ))}
        <div className="border-border mt-2 flex min-h-11 items-center gap-2 border-t px-3 pt-2">
          <Globe className="text-muted-foreground size-4" aria-hidden />
          <LanguageSwitcher compact />
        </div>
        {user ? (
          <button
            type="button"
            className="hover:bg-secondary focus-visible:ring-ring flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset"
            onClick={() =>
              void authClient.signOut().then(() => {
                clearAllPostDrafts();
                window.location.reload();
              })
            }
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            {t("signOut")}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

const shortcuts = keyboardNavItems();

export function ShellHeader({
  className,
  location,
  section,
  sectionInNavigation,
  leading,
  navigation,
  locationControl,
  trailing,
  destinations,
  account,
  user,
  community = false,
}: {
  className?: string;
  location: string;
  section?: string;
  sectionInNavigation?: boolean;
  leading?: ReactNode;
  navigation?: ReactNode;
  locationControl?: ReactNode;
  trailing?: ReactNode;
  destinations: readonly ShellDestination[];
  account: readonly ShellDestination[];
  user: HubAuthUser | null;
  community?: boolean;
}) {
  const t = useTranslations("redesign.shell");
  const nav = useTranslations("nav");
  const router = useRouter();
  const accountItems = user
    ? [
        ...account,
        { href: "/messages", label: nav("messages"), icon: MessageSquare },
      ]
    : [...account];
  const searchable = [
    {
      label: t(community ? "communityPages" : "hubPages"),
      items: [...destinations],
    },
    { label: t("account"), items: accountItems },
  ];
  function onShortcut(event: KeyboardEvent<HTMLElement>) {
    // Single-letter shortcuts are scoped to focus in the header (WCAG 2.1.4).
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.defaultPrevented
    )
      return;
    const target = event.target as HTMLElement;
    if (
      !event.currentTarget.contains(target) ||
      target.closest("input, select, textarea, [contenteditable]")
    )
      return;
    const key = event.key.toUpperCase();
    const href =
      shortcuts.find((item) => item.shortcut === key)?.href ??
      (key === "D" && user
        ? "/dashboard"
        : key === "A" && user
          ? "/dashboard/agent"
          : key === "J" && !user
            ? JOIN_HREF
            : undefined);
    if (href) {
      event.preventDefault();
      router.push(href);
    }
  }

  return (
    <header
      role="banner"
      onKeyDown={onShortcut}
      data-shell-header=""
      className={cn(
        "border-border bg-background sticky top-0 z-40 border-b",
        className,
      )}
    >
      <a
        href="#shell-content"
        className="bg-foreground text-background sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-md focus:px-4 focus:py-3"
      >
        {t("skipContent")}
      </a>
      <div className="flex min-h-12 items-center justify-between gap-1 px-2 sm:gap-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
          {leading}
          <div
            className={cn(
              "flex min-w-0 items-center gap-x-2",
              !locationControl &&
                "max-lg:flex-col max-lg:items-start max-lg:gap-y-0.5",
            )}
          >
            {locationControl ?? (
              <span
                className="max-w-full truncate text-xs leading-tight font-semibold lg:text-sm"
                title={location}
              >
                {location}
              </span>
            )}
            {section && (locationControl || section !== location) ? (
              <div
                className={cn(
                  "min-w-0 items-center gap-2 lg:flex",
                  locationControl && "max-lg:hidden",
                  sectionInNavigation && "lg:hidden",
                )}
              >
                {community ? (
                  <span
                    className="text-muted-foreground hidden lg:inline"
                    aria-hidden
                  >
                    /
                  </span>
                ) : (
                  <ChevronRight
                    className="text-muted-foreground hidden size-3.5 shrink-0 lg:block"
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    "block max-w-full truncate text-xs leading-tight lg:text-sm",
                    community
                      ? "text-foreground font-semibold lg:text-base"
                      : "text-muted-foreground font-medium",
                  )}
                  aria-live="polite"
                  title={section}
                >
                  {section}
                </span>
              </div>
            ) : null}
          </div>
        </div>
        {navigation}
        <div className="flex shrink-0 items-center gap-0.5">
          <PageFinder groups={searchable} />
          {user ? (
            <>
              <NotificationBell compact signedIn />
              <MessagesNavLink presentation="desktop" signedIn />
            </>
          ) : !community ? (
            <Link
              href={JOIN_HREF}
              className="focus-visible:ring-ring hover:bg-secondary inline-flex min-h-11 items-center rounded-md px-2.5 text-sm font-medium outline-none focus-visible:ring-2"
            >
              {nav("join")}
            </Link>
          ) : null}
          <AccountMenu user={user} links={account} />
          {trailing}
        </div>
      </div>
    </header>
  );
}
