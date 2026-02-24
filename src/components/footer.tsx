"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AitLogo } from "@/components/ait-logo";

export function Footer() {
  const t = useTranslations("footer");
  const tNav = useTranslations("nav");

  return (
    <footer className="bg-foreground text-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8">
        <div className="flex flex-col justify-between gap-12 lg:flex-row">
          {/* Brand */}
          <div className="space-y-3">
            <AitLogo className="h-6 w-auto" />
            <p className="text-muted-foreground max-w-70 text-sm">
              {t("description")}
            </p>
          </div>

          {/* Link Columns */}
          <div className="flex flex-wrap gap-16">
            {/* Navigate */}
            <div className="space-y-3">
              <h4 className="text-muted-foreground font-mono text-[11px] font-semibold tracking-wider">
                / {t("navigation").toUpperCase()}
              </h4>
              <nav className="flex flex-col gap-2">
                <Link
                  href="/"
                  className="hover:text-primary text-sm transition-colors"
                >
                  {tNav("home")}
                </Link>
                <Link
                  href="/events"
                  className="hover:text-primary text-sm transition-colors"
                >
                  {tNav("events")}
                </Link>
                <Link
                  href="/blog"
                  className="hover:text-primary text-sm transition-colors"
                >
                  {tNav("blog")}
                </Link>
                <Link
                  href="/community"
                  className="hover:text-primary text-sm transition-colors"
                >
                  {tNav("community")}
                </Link>
              </nav>
            </div>

            {/* Connect */}
            <div className="space-y-3">
              <h4 className="text-muted-foreground font-mono text-[11px] font-semibold tracking-wider">
                / {t("connect").toUpperCase()}
              </h4>
              <nav className="flex flex-col gap-2">
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary text-sm transition-colors"
                >
                  GitHub
                </a>
                <a
                  href="https://discord.gg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary text-sm transition-colors"
                >
                  Discord
                </a>
                <a
                  href="https://x.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary text-sm transition-colors"
                >
                  X (Twitter)
                </a>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary text-sm transition-colors"
                >
                  LinkedIn
                </a>
              </nav>
            </div>

            {/* Legal */}
            <div className="space-y-3">
              <h4 className="text-muted-foreground font-mono text-[11px] font-semibold tracking-wider">
                / {t("legal").toUpperCase()}
              </h4>
              <nav className="flex flex-col gap-2">
                <Link
                  href="/privacy"
                  className="hover:text-primary text-sm transition-colors"
                >
                  {t("privacy")}
                </Link>
                <Link
                  href="/terms"
                  className="hover:text-primary text-sm transition-colors"
                >
                  {t("terms")}
                </Link>
              </nav>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-muted-foreground font-mono text-[11px] tracking-wider">
            {t("copyright", { year: new Date().getFullYear() })}
          </p>
          <div className="flex text-muted-foreground font-mono text-[11px] tracking-wider">
          <p>
            BUILT WITH &#9829; BY &#29;
          </p><p> </p>
          <a href="https://klevox.com" className="hover:text-primary" target="_blank" > KLEVOX STUDIO</a></div>
        </div>
      </div>
    </footer>
  );
}
