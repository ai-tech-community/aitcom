"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Menu, LogOut, ChevronDown } from "lucide-react";
import { LanguageSwitcher } from "./language-switcher";
import { cn } from "@/lib/utils";
import { authClient } from "@/server/better-auth/client";
import { AitLogo } from "@/components/ait-logo";
import { NotificationBell } from "@/components/notifications/notification-bell";

// Source of truth for the IA split — see ADR-0010.
// New top-level destinations default to `primary: false` unless they are a
// recurring action surface or a flagship product.
const navLinks = [
  { href: "/communities", key: "communities", shortcut: "C", primary: true },
  { href: "/events", key: "events", shortcut: "E", primary: true },
  { href: "/challenges", key: "challenges", shortcut: "G", primary: true },
  { href: "/launchpad", key: "launchpad", shortcut: "L", primary: true },
  { href: "/benchmark", key: "benchmark", shortcut: "K", primary: false },
  { href: "/jobs", key: "jobs", shortcut: "W", primary: false },
  { href: "/agents", key: "agents", shortcut: "T", primary: false },
  { href: "/ideas", key: "ideas", shortcut: "F", primary: false },
  { href: "/members", key: "members", shortcut: "M", primary: false },
  { href: "/blog", key: "blog", shortcut: "B", primary: false },
  {
    href: "/investigations",
    key: "investigations",
    shortcut: "I",
    primary: false,
  },
  { href: "/impact", key: "impact", shortcut: "P", primary: false },
  { href: "/sponsors", key: "sponsors", shortcut: "S", primary: false },
] as const;

const primaryLinks = navLinks.filter((l) => l.primary);
const overflowLinks = navLinks.filter((l) => !l.primary);

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

export function Navbar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: session } = authClient.useSession();

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

      const match = navLinks.find((link) => link.shortcut === key);
      if (match) {
        e.preventDefault();
        router.push(match.href);
        return;
      }

      if (key === "D" && session?.user) {
        e.preventDefault();
        router.push("/dashboard");
      } else if (key === "A" && session?.user) {
        e.preventDefault();
        router.push("/dashboard/agent");
      } else if (key === "J" && !session?.user) {
        e.preventDefault();
        router.push("/auth/signup");
      }
    },
    [router, session],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const overflowActive = overflowLinks.some((l) => pathname === l.href);
  const user = session?.user;

  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="mx-auto flex h-12 items-center justify-between px-4 sm:px-8">
        {/* Left: Logo + Primary Nav + More */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center" aria-label="AIT. home">
            <AitLogo className="h-4 w-auto" />
          </Link>

          <div className="bg-border hidden h-4 w-px lg:block" />

          <nav className="hidden items-center gap-4 lg:flex">
            {primaryLinks.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className={cn(
                  "hover:text-foreground font-mono text-xs transition-colors",
                  pathname === link.href
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                [{link.shortcut}] {t(link.key).toUpperCase()}
              </Link>
            ))}

            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "hover:text-foreground flex items-center gap-0.5 font-mono text-xs transition-colors outline-none",
                  overflowActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {t("more").toUpperCase()}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                {overflowLinks.map((link) => (
                  <DropdownMenuItem key={link.key} asChild>
                    <Link
                      href={link.href}
                      className={cn(
                        "font-mono text-xs",
                        pathname === link.href && "text-foreground",
                      )}
                    >
                      [{link.shortcut}] {t(link.key).toUpperCase()}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>

        {/* Right: Language + Session (lg+) */}
        <div className="hidden items-center gap-2 lg:flex">
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
          <LanguageSwitcher />
          {user ? (
            <>
              <NotificationBell />
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
                    <AvatarFallback className="font-mono text-[10px]">
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
                      authClient.signOut().then(() => window.location.reload())
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
            <Link
              href="/auth/signup"
              className="bg-foreground text-background rounded px-3.5 py-1.5 font-mono text-xs font-semibold transition-opacity hover:opacity-80"
            >
              [J] JOIN
            </Link>
          )}
        </div>

        {/* Mobile / tablet (<lg) */}
        <div className="flex items-center gap-2 lg:hidden">
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
          <LanguageSwitcher />
          {user && <NotificationBell />}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="text-muted-foreground hover:text-foreground rounded p-1.5"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <nav className="mt-8 flex flex-col gap-4">
                {primaryLinks.map((link) => (
                  <Link
                    key={link.key}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "hover:text-foreground font-mono text-sm transition-colors",
                      pathname === link.href
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    [{link.shortcut}] {t(link.key).toUpperCase()}
                  </Link>
                ))}
                <div className="border-t" />
                {overflowLinks.map((link) => (
                  <Link
                    key={link.key}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "hover:text-foreground font-mono text-sm transition-colors",
                      pathname === link.href
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    [{link.shortcut}] {t(link.key).toUpperCase()}
                  </Link>
                ))}
                <div className="mt-4 flex flex-col gap-3 border-t pt-4">
                  {user ? (
                    <>
                      <Link
                        href="/dashboard"
                        onClick={() => setOpen(false)}
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
                        onClick={() => setOpen(false)}
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
                          setOpen(false);
                          void authClient
                            .signOut()
                            .then(() => window.location.reload());
                        }}
                        className="text-muted-foreground hover:text-foreground flex items-center gap-2 font-mono text-sm transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        SIGN OUT
                      </button>
                    </>
                  ) : (
                    <Link
                      href="/auth/signup"
                      onClick={() => setOpen(false)}
                      className="bg-foreground text-background rounded px-4 py-2 text-center font-mono text-sm font-semibold"
                    >
                      [J] JOIN
                    </Link>
                  )}
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
