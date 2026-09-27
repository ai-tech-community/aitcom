import type { ReactElement } from "react";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { MoreLink } from "@/components/ui/more-link";
import { SectionLabel } from "@/components/ui/section-label";
import { SPONSOR_ROW_MIN, type HomeSponsor } from "./home-sponsor";

/** A sponsor name that links out: underlined at rest, not by colour or weight alone. */
const TEXT_LINK =
  "underline decoration-1 underline-offset-4 hover:decoration-2";

/** Outbound link to a sponsor's own site; only rendered when one exists. */
function SponsorLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-[3px] ${className}`}
    >
      {children}
    </a>
  );
}

/**
 * One or two sponsors: a plain sentence at full strength. Each sponsor is
 * its logo (named by its alt text) or, without one, its name.
 */
function SponsorLine({ sponsors }: { sponsors: readonly HomeSponsor[] }) {
  const t = useTranslations("homeSponsors");
  const format = useFormatter();
  const names: ReactElement[] = sponsors.map((sponsor) => {
    const body = sponsor.logoUrl ? (
      <Image
        src={sponsor.logoUrl}
        alt={sponsor.name}
        width={120}
        height={32}
        className="h-7 w-auto object-contain"
      />
    ) : (
      sponsor.name
    );
    const itemClass =
      "inline-flex min-h-6 items-center align-middle font-medium";
    return sponsor.href ? (
      <SponsorLink
        key={sponsor.id}
        href={sponsor.href}
        // A name is only a link if it looks like one without colour
        // (WCAG 1.4.1); a logo is plainly a picture you can click.
        className={sponsor.logoUrl ? itemClass : `${itemClass} ${TEXT_LINK}`}
      >
        {body}
      </SponsorLink>
    ) : (
      <span key={sponsor.id} className={itemClass}>
        {body}
      </span>
    );
  });

  // One whole sentence per language; the list sits where the translator
  // put the <sponsors> tag, so word order is never glued together in code.
  const list = format.list(names, { type: "conjunction" });
  return (
    <p className="mt-6 text-lg leading-relaxed text-pretty">
      {t.rich("supportedBy", { sponsors: () => list })}
    </p>
  );
}

/** Three or more: an aligned row of logos (name as text when there is none). */
function SponsorRow({ sponsors }: { sponsors: readonly HomeSponsor[] }) {
  return (
    <ul className="mt-8 flex flex-wrap items-center gap-x-12 gap-y-8">
      {sponsors.map((sponsor) => {
        const body = sponsor.logoUrl ? (
          <Image
            src={sponsor.logoUrl}
            alt={sponsor.name}
            width={160}
            height={48}
            className="h-10 w-auto object-contain sm:h-12"
          />
        ) : (
          <span className="text-lg font-medium">{sponsor.name}</span>
        );
        return (
          <li key={sponsor.id} className="flex min-h-12 items-center">
            {sponsor.href ? (
              <SponsorLink
                href={sponsor.href}
                className={
                  sponsor.logoUrl
                    ? "inline-flex items-center"
                    : `inline-flex items-center ${TEXT_LINK}`
                }
              >
                {body}
              </SponsorLink>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Homepage sponsors. Until there are three, a row of logos would look
 * empty, so one or two sponsors are named in a plain sentence ("Supported
 * by …"); from three on they get a proper row. A sponsor links out only
 * when it has a real website — never a placeholder `#`. "Become a sponsor"
 * always stays.
 */
export function HomeSponsors({
  sponsors,
}: {
  sponsors: readonly HomeSponsor[];
}) {
  const t = useTranslations("homeSponsors");

  return (
    <section
      aria-labelledby="home-sponsors-title"
      className="px-6 py-12 sm:px-12"
    >
      <SectionLabel id="home-sponsors-title" className="pb-4">
        {t("title")}
      </SectionLabel>

      {sponsors.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-base leading-relaxed">
          {t("none")}
        </p>
      ) : sponsors.length < SPONSOR_ROW_MIN ? (
        <SponsorLine sponsors={sponsors} />
      ) : (
        <SponsorRow sponsors={sponsors} />
      )}

      <div className="mt-4 text-right">
        <MoreLink href="/sponsors">{t("become")}</MoreLink>
      </div>
    </section>
  );
}
