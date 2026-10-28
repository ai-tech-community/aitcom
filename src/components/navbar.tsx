"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import { LanguageSwitcher } from "./language-switcher";
import { cn } from "@/lib/utils";
import { useInitialAuthUser } from "@/components/auth/session-provider";
import { authClient } from "@/server/better-auth/client";
import {
  documentAuthUser,
  type HubAuthUser,
} from "@/server/better-auth/hub-session";
import { AitLogo } from "@/components/ait-logo";
import { clearAllPostDrafts } from "@/lib/post-drafts";
import {
  JOIN_HREF,
  NAV_BAR,
  keyboardNavItems,
  type NavGroup,
  type NavItem,
} from "@/components/site-nav";

const NotificationBell = dynamic(() =>
  import("@/components/notifications/notification-bell").then(
    (m) => m.NotificationBell,
  ),
);
const MessagesNavLink = dynamic(() =>
  import("@/components/inbox/messages-nav-link").then((m) => m.MessagesNavLink),
);

function isNavHrefActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsFrom(name?: string | null, email?: string | null) {
  const trimmedName = name?.trim();
  const trimmedEmail = email?.trim();
  const source =
    trimmedName && trimmedName.length > 0
      ? trimmedName
      : trimmedEmail && trimmedEmail.length > 0
        ? trimmedEmail
        : "";
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function itemLabel(
  t: (key: string) => string,
  item: Pick<NavItem, "key" | "shortcut">,
) {
  return `[${item.shortcut}] ${t(item.key).toUpperCase()}`;
}

function GitHubLink() {
  return (
    <a
      href="https://github.com/ai-tech-community/aitcom"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View source on GitHub"
      className="text-muted-foreground hover:text-foreground rounded p-1.5 transition-colors"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    </a>
  );
}

function JoinLink({
  onClick,
  className,
}: {
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Link
      href={JOIN_HREF}
      onClick={onClick}
      className={cn(
        "bg-foreground text-background rounded px-3.5 py-1.5 font-mono text-xs font-semibold transition-opacity hover:opacity-80",
        className,
      )}
    >
      [J] JOIN
    </Link>
  );
}

function NavDestination({
  item,
  pathname,
  onNavigate,
  t,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
  t: (key: string) => string;
}) {
  const active = isNavHrefActive(pathname, item.href);
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "hover:bg-secondary/50 focus-visible:ring-ring flex flex-col gap-0.5 rounded-sm px-3 py-2 outline-none focus-visible:ring-2",
          active && "bg-secondary",
        )}
      >
        <span
          className={cn(
            "font-mono text-xs",
            active
              ? "text-foreground decoration-foreground underline underline-offset-4"
              : "text-foreground",
          )}
        >
          {itemLabel(t, item)}
        </span>
        <span className="text-muted-foreground text-xs leading-4">
          {t(`descriptions.${item.key}`)}
        </span>
      </Link>
    </li>
  );
}

function NavGroupMenu({
  group,
  surface,
  pathname,
  open,
  onToggle,
  onOpenAt,
  onClose,
  onNavigate,
  t,
}: {
  group: NavGroup;
  surface: "desktop" | "mobile";
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onOpenAt: (index: number) => void;
  onClose: () => void;
  onNavigate: () => void;
  t: (key: string) => string;
}) {
  const panelId = `site-nav-${surface}-${group.key}`;
  const triggerId = `${panelId}-trigger`;
  const label = t(`groups.${group.key}`).toUpperCase();
  const active = group.items.some((item) =>
    isNavHrefActive(pathname, item.href),
  );
  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onOpenAt(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      onOpenAt(group.items.length - 1);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      onClose();
    }
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const links = [
      ...event.currentTarget.querySelectorAll<HTMLAnchorElement>("a"),
    ];
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = index < 0 ? 0 : (index + 1) % links.length;
      links[next]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = index <= 0 ? links.length - 1 : index - 1;
      links[next]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      links[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      links[links.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      document.getElementById(triggerId)?.focus();
    }
  }

  return (
    <div
      data-nav-popover={panelId}
      className={cn(
        "relative flex items-center",
        surface === "desktop" ? "h-12" : "w-full flex-col items-stretch",
      )}
    >
      <button
        type="button"
        id={triggerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "hover:text-foreground focus-visible:ring-ring flex cursor-pointer items-center gap-0.5 rounded-sm font-mono text-xs uppercase transition-colors outline-none focus-visible:ring-2",
          surface === "mobile" ? "w-full py-1 text-sm" : "whitespace-nowrap",
          active
            ? "text-foreground decoration-foreground underline underline-offset-4"
            : "text-muted-foreground",
        )}
      >
        {label}
        <ChevronDown
          className={cn("h-3 w-3 shrink-0", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {/* Closed menus stay in the server HTML. `hidden` removes them from
          the accessibility tree and the tab order until the button opens. */}
      <div
        id={panelId}
        role="group"
        aria-labelledby={triggerId}
        hidden={!open}
        onKeyDown={onMenuKeyDown}
        className={cn(
          surface === "desktop"
            ? "bg-popover text-popover-foreground border-border absolute top-full left-0 z-50 mt-px w-max min-w-64 rounded-md border p-1 shadow-md"
            : "w-full py-1",
        )}
      >
        <ul>
          {group.items.map((item) => (
            <NavDestination
              key={item.key}
              item={item}
              pathname={pathname}
              onNavigate={onNavigate}
              t={t}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function SiteNavSections({
  surface,
  pathname,
  openMenu,
  setOpenMenu,
  onNavigate,
  t,
}: {
  surface: "desktop" | "mobile";
  pathname: string;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  onNavigate: () => void;
  t: (key: string) => string;
}) {
  const pendingFocus = useRef<{ id: string; index: number } | null>(null);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    if (pending.id !== openMenu) return;
    pendingFocus.current = null;
    const panel = document.getElementById(pending.id);
    const link = panel?.querySelectorAll<HTMLAnchorElement>("a")[pending.index];
    link?.focus();
  }, [openMenu]);

  function focusItem(id: string, index: number) {
    const panel = document.getElementById(id);
    const link = panel?.querySelectorAll<HTMLAnchorElement>("a")[index];
    if (openMenu === id && link) {
      link.focus();
      return;
    }
    pendingFocus.current = { id, index };
    setOpenMenu(id);
  }

  return (
    <>
      {NAV_BAR.map((entry) => {
        if (entry.type === "link") {
          const active = isNavHrefActive(pathname, entry.href);
          return (
            <Link
              key={entry.key}
              href={entry.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "hover:text-foreground focus-visible:ring-ring rounded-sm font-mono text-xs whitespace-nowrap transition-colors outline-none focus-visible:ring-2",
                surface === "mobile" && "py-1 text-sm",
                active
                  ? "text-foreground decoration-foreground underline underline-offset-4"
                  : "text-muted-foreground",
              )}
            >
              {itemLabel(t, entry)}
            </Link>
          );
        }

        const id = `site-nav-${surface}-${entry.key}`;
        return (
          <NavGroupMenu
            key={entry.key}
            group={entry}
            surface={surface}
            pathname={pathname}
            open={openMenu === id}
            onToggle={() => setOpenMenu(openMenu === id ? null : id)}
            onOpenAt={(index) => focusItem(id, index)}
            onClose={() => setOpenMenu(null)}
            onNavigate={onNavigate}
            t={t}
          />
        );
      })}
    </>
  );
}

export function Navbar({
  initialUser = null,
}: {
  initialUser?: HubAuthUser | null;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const menuTitleId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { data: session } = authClient.useSession();
  const publishedUser = useInitialAuthUser();
  const user = documentAuthUser(initialUser, publishedUser, session?.user);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement).isContentEditable
      )
        return;

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toUpperCase();

      const match = keyboardNavItems().find((link) => link.shortcut === key);
      if (match) {
        e.preventDefault();
        router.push(match.href);
        return;
      }

      if (key === "D" && user) {
        e.preventDefault();
        router.push("/dashboard");
      } else if (key === "A" && user) {
        e.preventDefault();
        router.push("/dashboard/agent");
      } else if (key === "J" && !user) {
        e.preventDefault();
        router.push(JOIN_HREF);
      }
    },
    [router, user],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!openMenu) return;
    function onMouseDown(event: MouseEvent) {
      const wrapper = document.querySelector(
        `[data-nav-popover="${openMenu}"]`,
      );
      if (
        wrapper &&
        event.target instanceof Node &&
        wrapper.contains(event.target)
      ) {
        return;
      }
      setOpenMenu(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [openMenu]);

  useEffect(() => {
    if (!mobileOpen) return;
    const root = mobilePanelRef.current;
    const previously = document.activeElement as HTMLElement | null;
    const focusable = () =>
      [
        ...(root?.querySelectorAll<HTMLElement>(
          'a, button, summary, [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((el) => !el.closest("[hidden]"));

    focusable()[0]?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !root) return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previously?.focus();
    };
  }, [mobileOpen]);

  function closeAll() {
    setOpenMenu(null);
    setMobileOpen(false);
  }

  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-50 w-full overflow-visible border-b backdrop-blur">
      <div className="mx-auto flex h-12 items-center justify-between gap-3 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="flex items-center" aria-label="AIT. home">
            <AitLogo className="h-4 w-auto" />
          </Link>

          <div className="bg-border hidden h-4 w-px lg:block" />

          <nav
            aria-label={t("primaryNav")}
            className="hidden items-center gap-4 lg:flex"
          >
            <SiteNavSections
              surface="desktop"
              pathname={pathname}
              openMenu={openMenu}
              setOpenMenu={setOpenMenu}
              onNavigate={closeAll}
              t={t}
            />
          </nav>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <GitHubLink />
          <LanguageSwitcher />
          {user && <MessagesNavLink />}
          {user && <NotificationBell />}
          {user ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="focus-visible:ring-ring ml-1 rounded-full outline-none focus-visible:ring-2"
                  aria-label="Account menu"
                >
                  <Avatar className="h-7 w-7">
                    {user.image ? (
                      <AvatarImage
                        src={user.image}
                        alt={user.name ?? "Account"}
                      />
                    ) : null}
                    <AvatarFallback className="font-mono text-xs">
                      {initialsFrom(user.name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuItem asChild>
                    <Link
                      href="/dashboard"
                      className={cn(
                        "font-mono text-xs",
                        pathname === "/dashboard" && "text-foreground",
                      )}
                    >
                      [D] DASHBOARD
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/dashboard/agent"
                      className={cn(
                        "font-mono text-xs",
                        pathname.startsWith("/dashboard/agent") &&
                          "text-foreground",
                      )}
                    >
                      [A] {t("myAgent").toUpperCase()}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() =>
                      authClient.signOut().then(() => {
                        clearAllPostDrafts();
                        window.location.reload();
                      })
                    }
                    className="font-mono text-xs"
                  >
                    <LogOut className="mr-2 h-3.5 w-3.5" />
                    SIGN OUT
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <JoinLink />
          )}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <GitHubLink />
          <LanguageSwitcher />
          {user && <MessagesNavLink />}
          {user && <NotificationBell />}
          {!user && <JoinLink className="px-2.5 py-1" />}
          <button
            ref={menuButtonRef}
            type="button"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded p-1.5 outline-none focus-visible:ring-2"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={
              mobileOpen ? "Close navigation menu" : "Open navigation menu"
            }
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {mobileOpen &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close navigation menu"
              className="fixed inset-0 z-50 bg-black/50"
              onClick={() => setMobileOpen(false)}
            />
            <div
              id="mobile-nav"
              ref={mobilePanelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={menuTitleId}
              className="bg-background fixed inset-y-0 right-0 z-50 flex w-72 flex-col gap-4 overflow-y-auto border-l p-6 shadow-lg"
            >
              <div className="flex items-center justify-between">
                <h2 id={menuTitleId} className="sr-only">
                  {t("mobileNav")}
                </h2>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring ml-auto rounded p-1.5 outline-none focus-visible:ring-2"
                  aria-label="Close"
                  onClick={() => {
                    setMobileOpen(false);
                    menuButtonRef.current?.focus();
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav aria-label={t("mobileNav")} className="flex flex-col gap-3">
                <SiteNavSections
                  surface="mobile"
                  pathname={pathname}
                  openMenu={openMenu}
                  setOpenMenu={setOpenMenu}
                  onNavigate={closeAll}
                  t={t}
                />
              </nav>
              <div className="mt-2 flex flex-col gap-3 border-t pt-4">
                {user ? (
                  <>
                    <Link
                      href="/dashboard"
                      onClick={closeAll}
                      className={cn(
                        "hover:text-foreground font-mono text-sm transition-colors",
                        pathname === "/dashboard"
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      [D] DASHBOARD
                    </Link>
                    <Link
                      href="/dashboard/agent"
                      onClick={closeAll}
                      className={cn(
                        "hover:text-foreground font-mono text-sm transition-colors",
                        pathname.startsWith("/dashboard/agent")
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      [A] {t("myAgent").toUpperCase()}
                    </Link>
                    <button
                      onClick={() => {
                        closeAll();
                        void authClient.signOut().then(() => {
                          clearAllPostDrafts();
                          window.location.reload();
                        });
                      }}
                      className="text-muted-foreground hover:text-foreground flex items-center gap-2 font-mono text-sm transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      SIGN OUT
                    </button>
                  </>
                ) : (
                  <JoinLink
                    onClick={closeAll}
                    className="px-4 py-2 text-center text-sm"
                  />
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </header>
  );
}
