import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SectionLabel } from "@/components/ui/section-label";
import { AsciiVignette } from "./ascii-vignette";
import { WHAT_WE_DO_GROUPS } from "./groups";

/**
 * Homepage "What we do": four rows (Gather, Build, Work, Learn), each a
 * heading, one sentence and one link to the group's main place.
 *
 * From `lg` each row has a small ASCII vignette beside the text, alternating
 * left/right so the section reads as one composition, not a card grid.
 * Below `lg` the vignettes are left out: stacked above the text they would
 * add four picture-sized blocks of scrolling on a phone without saying
 * anything new, and the page already brings the town square back in its
 * closing band. Hidden vignettes measure to nothing and stay paused.
 */
export function WhatWeDo() {
  const t = useTranslations("whatWeDo");

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
              className="grid gap-6 py-8 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-10"
            >
              <AsciiVignette
                name={group.key}
                className={`border-border hidden h-56 rounded-xl border lg:block ${
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
                <Link
                  href={group.href}
                  className="group focus-visible:ring-ring/50 mt-4 inline-flex min-h-6 items-center gap-2 rounded-sm py-1 text-base font-medium decoration-1 underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
                >
                  {t(`groups.${group.key}.link`)}
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                  />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
