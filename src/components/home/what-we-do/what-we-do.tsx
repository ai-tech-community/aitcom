import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SectionLabel } from "@/components/ui/section-label";
import { AsciiVignette } from "./ascii-vignette";
import { WHAT_WE_DO_GROUPS } from "./groups";

/**
 * Homepage "What we do": four groups (Gather, Build, Work, Learn), each a
 * row with a small ASCII vignette beside a heading, one sentence and its
 * destinations as plain links. Rows alternate art left/right from `lg` so
 * the section reads as one composition, not a grid of identical cards; on
 * phones each row stacks art, text, links.
 */
export function WhatWeDo() {
  const t = useTranslations("whatWeDo");
  const nav = useTranslations("nav");

  return (
    <section aria-labelledby="what-we-do-title" className="px-6 py-12 sm:px-12">
      <SectionLabel id="what-we-do-title" className="pb-4">
        {t("kicker")}
      </SectionLabel>

      <div className="divide-border divide-y">
        {WHAT_WE_DO_GROUPS.map((group, i) => {
          const artRight = i % 2 === 1;
          return (
            <article
              key={group.key}
              aria-labelledby={`what-we-do-${group.key}`}
              className="grid gap-6 py-10 lg:grid-cols-2 lg:items-center lg:gap-16"
            >
              <AsciiVignette
                name={group.key}
                className={`border-border h-36 rounded-xl border sm:h-48 lg:h-56 ${
                  artRight ? "lg:order-2" : ""
                }`}
              />
              <div className="min-w-0">
                <h3
                  id={`what-we-do-${group.key}`}
                  className="text-2xl leading-tight font-semibold tracking-tight text-balance"
                >
                  {t(`groups.${group.key}.title`)}
                </h3>
                <p className="text-muted-foreground mt-2 max-w-prose text-base leading-relaxed text-pretty">
                  {t(`groups.${group.key}.description`)}
                </p>
                <ul className="border-border mt-6 border-t">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="group border-border hover:bg-secondary/50 focus-visible:ring-ring/50 flex items-center gap-4 border-b px-2 py-3 transition-colors outline-none focus-visible:ring-[3px]"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-6">
                          <span className="font-medium sm:w-36 sm:shrink-0">
                            {nav(link.nav)}
                          </span>
                          <span className="text-muted-foreground text-sm leading-snug">
                            {t(`groups.${group.key}.links.${link.nav}`)}
                          </span>
                        </span>
                        <ArrowRight
                          aria-hidden="true"
                          className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
