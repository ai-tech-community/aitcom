"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function Footer() {
  const t = useTranslations("footer");
  const tNav = useTranslations("nav");

  return (
    <footer className="bg-foreground text-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8">
        <div className="flex flex-col justify-between gap-12 lg:flex-row">
          {/* Brand */}
          <div className="space-y-3">
            <span className="text-2xl font-extrabold tracking-tight">
              AIT<span className="text-primary">.</span>
            </span>
            <p className="max-w-70 text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>

          {/* Link Columns */}
          <div className="flex flex-wrap gap-16">
            {/* Navigate */}
            <div className="space-y-3">
              <h4 className="font-mono text-[11px] font-semibold tracking-wider text-muted-foreground">
                / {t("navigation").toUpperCase()}
              </h4>
              <nav className="flex flex-col gap-2">
                <Link href="/" className="text-sm transition-colors hover:text-primary">
                  {tNav("home")}
                </Link>
                <Link href="/events" className="text-sm transition-colors hover:text-primary">
                  {tNav("events")}
                </Link>
                <Link href="/blog" className="text-sm transition-colors hover:text-primary">
                  {tNav("blog")}
                </Link>
                <Link href="/community" className="text-sm transition-colors hover:text-primary">
                  {tNav("community")}
                </Link>
              </nav>
            </div>

            {/* Connect */}
            <div className="space-y-3">
              <h4 className="font-mono text-[11px] font-semibold tracking-wider text-muted-foreground">
                / {t("connect").toUpperCase()}
              </h4>
              <nav className="flex flex-col gap-2">
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-sm transition-colors hover:text-primary">
                  GitHub
                </a>
                <a href="https://discord.gg" target="_blank" rel="noopener noreferrer" className="text-sm transition-colors hover:text-primary">
                  Discord
                </a>
                <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="text-sm transition-colors hover:text-primary">
                  X (Twitter)
                </a>
                <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-sm transition-colors hover:text-primary">
                  LinkedIn
                </a>
              </nav>
            </div>

            {/* Legal */}
            <div className="space-y-3">
              <h4 className="font-mono text-[11px] font-semibold tracking-wider text-muted-foreground">
                / {t("legal").toUpperCase()}
              </h4>
              <nav className="flex flex-col gap-2">
                <Link href="/privacy" className="text-sm transition-colors hover:text-primary">
                  {t("privacy")}
                </Link>
                <Link href="/terms" className="text-sm transition-colors hover:text-primary">
                  {t("terms")}
                </Link>
              </nav>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground">
            {t("copyright", { year: new Date().getFullYear() })}
          </p>
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground">
            BUILT WITH &#9829; IN THE NETHERLANDS
          </p>
        </div>
      </div>
    </footer>
  );
}
