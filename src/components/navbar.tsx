"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, LogOut } from "lucide-react";
import { LanguageSwitcher } from "./language-switcher";
import { cn } from "@/lib/utils";
import { authClient } from "@/server/better-auth/client";

const navLinks = [
  { href: "/events", key: "events", shortcut: "E" },
  { href: "/members", key: "members", shortcut: "M" },
  { href: "/blog", key: "blog", shortcut: "B" },
  { href: "/community", key: "community", shortcut: "C" },
] as const;

export function Navbar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { data: session } = authClient.useSession();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-12 items-center justify-between px-4 sm:px-8">
        {/* Left: Logo + Nav Links */}
        <div className="flex items-center gap-4">
          <Link href="/" className="text-base font-extrabold tracking-tight">
            AIT<span className="text-primary">.</span>
          </Link>

          <div className="hidden h-4 w-px bg-border md:block" />

          <nav className="hidden items-center gap-4 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className={cn(
                  "font-mono text-xs transition-colors hover:text-foreground",
                  pathname === link.href
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                [{link.shortcut}] {t(link.key).toUpperCase()}
              </Link>
            ))}
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              [G] GITHUB
            </a>
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
                  "font-mono text-xs transition-colors hover:text-foreground",
                  pathname === "/dashboard"
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                [D] DASHBOARD
              </Link>
              <button
                onClick={() =>
                  authClient.signOut().then(() => window.location.reload())
                }
                className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <Link
              href="/auth/signup"
              className="rounded bg-foreground px-3.5 py-1.5 font-mono text-xs font-semibold text-background transition-opacity hover:opacity-80"
            >
              [J] JOIN
            </Link>
          )}
        </div>

        {/* Mobile Menu */}
        <div className="flex items-center gap-2 md:hidden">
          <LanguageSwitcher />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button className="rounded p-1.5 text-muted-foreground hover:text-foreground">
                <Menu className="h-5 w-5" />
              </button>
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
                      "font-mono text-sm transition-colors hover:text-foreground",
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
                          "font-mono text-sm transition-colors hover:text-foreground",
                          pathname === "/dashboard"
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        [D] DASHBOARD
                      </Link>
                      <button
                        onClick={() => {
                          setOpen(false);
                          void authClient
                            .signOut()
                            .then(() => window.location.reload());
                        }}
                        className="flex items-center gap-2 font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <LogOut className="h-4 w-4" />
                        SIGN OUT
                      </button>
                    </>
                  ) : (
                    <Link
                      href="/auth/signup"
                      onClick={() => setOpen(false)}
                      className="rounded bg-foreground px-4 py-2 text-center font-mono text-sm font-semibold text-background"
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
