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
import { Menu, LogOut } from "lucide-react";
import { LanguageSwitcher } from "./language-switcher";
import { cn } from "@/lib/utils";
import { authClient } from "@/server/better-auth/client";
import { AitLogo } from "@/components/ait-logo";
import { NotificationBell } from "@/components/notifications/notification-bell";

const navLinks = [
  { href: "/communities", key: "communities", shortcut: "C" },
  { href: "/events", key: "events", shortcut: "E" },
  { href: "/challenges", key: "challenges", shortcut: "G" },
  { href: "/launchpad", key: "launchpad", shortcut: "L" },
  { href: "/blog", key: "blog", shortcut: "B" },
  { href: "/jobs", key: "jobs", shortcut: "W" },
  { href: "/benchmark", key: "benchmark", shortcut: "K" },
  { href: "/impact", key: "impact", shortcut: "I" },
  { href: "/sponsors", key: "sponsors", shortcut: "S" },
  { href: "/members", key: "members", shortcut: "M" },
] as const;

export function Navbar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: session } = authClient.useSession();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore when typing in inputs, textareas, or contenteditable elements
      const tag = (e.target as HTMLElement).tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement).isContentEditable
      )
        return;

      // Ignore when modifier keys are held
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toUpperCase();

      // Check navLinks shortcuts
      const match = navLinks.find((link) => link.shortcut === key);
      if (match) {
        e.preventDefault();
        router.push(match.href);
        return;
      }

      // Additional shortcuts
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

  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="mx-auto flex h-12 items-center justify-between px-4 sm:px-8">
        {/* Left: Logo + Nav Links */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center" aria-label="AIT. home">
            <AitLogo className="h-4 w-auto" />
          </Link>

          <div className="bg-border hidden h-4 w-px md:block" />

          <nav className="hidden items-center gap-4 md:flex">
            {navLinks.map((link) => (
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
          </nav>
        </div>

        {/* Right: Language + Session */}
        <div className="hidden items-center gap-2 md:flex">
          <LanguageSwitcher />
          {session?.user ? (
            <>
              <Link
                href="/dashboard"
                className={cn(
                  "hover:text-foreground font-mono text-xs transition-colors",
                  pathname === "/dashboard"
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                [D] DASHBOARD
              </Link>
              <Link
                href="/dashboard/agent"
                className={cn(
                  "hover:text-foreground font-mono text-xs transition-colors",
                  pathname.startsWith("/dashboard/agent")
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                [A] {t("myAgent").toUpperCase()}
              </Link>
              <NotificationBell />
              <button
                onClick={() =>
                  authClient.signOut().then(() => window.location.reload())
                }
                className="text-muted-foreground hover:text-foreground rounded p-1.5 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
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

        {/* Mobile Menu */}
        <div className="flex items-center gap-2 md:hidden">
          <LanguageSwitcher />
          {session?.user && <NotificationBell />}
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
                {navLinks.map((link) => (
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
                  {session?.user ? (
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
