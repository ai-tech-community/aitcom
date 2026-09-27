"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AitLogo } from "@/components/ait-logo";
import { SectionLabel } from "@/components/ui/section-label";

/**
 * Site footer: an ink band in both themes. The `dark` class scopes the dark
 * token set to the footer, so its muted text is the dark theme's
 * `--muted-foreground` on the dark `--background` (about 7.6:1), not the
 * light theme's grey on ink (4.2:1) — and in dark mode it no longer flips
 * to a near-white slab. Column labels are h2s (the level after the page's
 * h1), each naming its own `nav` landmark.
 */
export function Footer() {
  const t = useTranslations("footer");
  const tNav = useTranslations("nav");

  return (
    <footer className="dark bg-background text-foreground border-border border-t">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-12">
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
              <SectionLabel id="footer-navigation" bordered={false}>
                {t("navigation")}
              </SectionLabel>
              <nav
                aria-labelledby="footer-navigation"
                className="flex flex-col gap-2"
              >
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
                  href="/roles"
                  className="hover:text-primary text-sm transition-colors"
                >
                  {tNav("roles")}
                </Link>
                <Link
                  href="/jobs"
                  className="hover:text-primary text-sm transition-colors"
                >
                  {tNav("jobs")}
                </Link>
                <Link
                  href="/blog"
                  className="hover:text-primary text-sm transition-colors"
                >
                  {tNav("blog")}
                </Link>
                <Link
                  href="/communities"
                  className="hover:text-primary text-sm transition-colors"
                >
                  {tNav("community")}
                </Link>
                <Link
                  href="/startups"
                  className="hover:text-primary text-sm transition-colors"
                >
                  {tNav("startups")}
                </Link>
              </nav>
            </div>

            {/* Connect */}
            <div className="space-y-3">
              <SectionLabel id="footer-connect" bordered={false}>
                {t("connect")}
              </SectionLabel>
              <nav
                aria-labelledby="footer-connect"
                className="flex flex-col gap-2"
              >
                <a
                  href="https://github.com/ai-tech-community"
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
              <SectionLabel id="footer-legal" bordered={false}>
                {t("legal")}
              </SectionLabel>
              <nav
                aria-labelledby="footer-legal"
                className="flex flex-col gap-2"
              >
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
                <Link
                  href="/security"
                  className="hover:text-primary text-sm transition-colors"
                >
                  {t("security")}
                </Link>
              </nav>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-border mt-12 flex flex-col items-center justify-between gap-4 border-t pt-6 sm:flex-row">
          <p className="text-muted-foreground font-mono text-xs tracking-wider">
            {t("copyright", { year: new Date().getFullYear() })}
          </p>
          <div className="text-muted-foreground flex font-mono text-xs tracking-wider">
            <p>BUILT WITH &#9829; BY &#29;</p>
            <p> </p>
            <a
              href="https://klevox.com"
              className="hover:text-primary"
              target="_blank"
            >
              {" "}
              KLEVOX STUDIO
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
