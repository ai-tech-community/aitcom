import type { Metadata } from "next";

/**
 * Site-wide title and description for en, nl, and fr.
 * Layout defaults, invite previews, the default Open Graph image, and the
 * homepage Organization JSON-LD all read this. Change the wording here.
 */
export const SITE_LOCALES = ["en", "nl", "fr"] as const;

export type SiteLocale = (typeof SITE_LOCALES)[number];

export const SITE_NAME = "AIT Community";

const TITLE_SEPARATOR = " – ";

export const SITE_COPY = {
  en: {
    title: `${SITE_NAME}${TITLE_SEPARATOR}Communities, events and people building together`,
    description:
      "Join local and online communities on AIT: meetups, language groups, forums, magazines, jobs and startups, with AI agents helping along the way.",
  },
  nl: {
    title: `${SITE_NAME}${TITLE_SEPARATOR}Communities, evenementen en mensen die samen bouwen`,
    description:
      "Sluit je aan bij lokale en online communities op AIT: meetups, taalgroepen, forums, magazines, vacatures en startups, met AI-agents die onderweg een handje helpen.",
  },
  fr: {
    title: `${SITE_NAME}${TITLE_SEPARATOR}Communautés, événements et personnes qui construisent ensemble`,
    description:
      "Rejoignez des communautés locales et en ligne sur AIT : rencontres, groupes de langue, forums, magazines, emplois et startups, avec des agents IA qui donnent un coup de main.",
  },
} as const satisfies Record<
  SiteLocale,
  { readonly title: string; readonly description: string }
>;

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

export function siteLocale(locale: string): SiteLocale {
  return (SITE_LOCALES as readonly string[]).includes(locale)
    ? (locale as SiteLocale)
    : "en";
}

export function siteMetadataFor(locale: string) {
  return SITE_COPY[siteLocale(locale)];
}

/** The line under the wordmark on the default share image. */
export function siteImageSubtitle(locale: string): string {
  const title = siteMetadataFor(locale).title;
  const marker = `${SITE_NAME}${TITLE_SEPARATOR}`;
  return title.startsWith(marker) ? title.slice(marker.length) : title;
}

export function siteOgImage(locale: string) {
  const resolved = siteLocale(locale);
  const params = new URLSearchParams({
    title: SITE_NAME,
    subtitle: siteImageSubtitle(resolved),
  });
  return {
    url: `/${resolved}/og?${params.toString()}`,
    alt: SITE_COPY[resolved].title,
    width: OG_WIDTH,
    height: OG_HEIGHT,
  };
}

function siteTwitterImage(locale: string) {
  const image = siteOgImage(locale);
  return { url: image.url, alt: image.alt };
}

/**
 * Open Graph and Twitter tags for a page that should advertise the site
 * itself, such as an invite link.
 */
export function siteSocialMetadata(
  locale: string,
): Pick<Metadata, "openGraph" | "twitter"> {
  const copy = siteMetadataFor(locale);
  return {
    openGraph: {
      title: copy.title,
      description: copy.description,
      siteName: SITE_NAME,
      type: "website",
      images: [siteOgImage(locale)],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: [siteTwitterImage(locale)],
    },
  };
}

/**
 * Default document metadata for a locale.
 *
 * Open Graph and Twitter title and description are left unset. Next.js copies
 * the resolved document title and description into those tags when a page does
 * not set its own, so the news page and other pages keep their wording. The
 * default share image and its alt text still come from here.
 */
export function siteLayoutMetadata(
  locale: string,
): Pick<Metadata, "title" | "description" | "openGraph" | "twitter"> {
  const copy = siteMetadataFor(locale);
  const image = siteOgImage(locale);
  return {
    title: {
      default: copy.title,
      template: `%s - ${SITE_NAME}`,
    },
    description: copy.description,
    openGraph: {
      siteName: SITE_NAME,
      type: "website",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}

function orFallback(value: string | null, fallback: string): string {
  if (value == null || value.length === 0) return fallback;
  return value;
}

/** Text drawn on `/[locale]/og` when a page does not pass its own. */
export function ogImageCopy(
  locale: string,
  title: string | null,
  subtitle: string | null,
): { title: string; subtitle: string } {
  return {
    title: orFallback(title, SITE_NAME),
    subtitle: orFallback(subtitle, siteImageSubtitle(locale)),
  };
}

/** Organization node for the homepage. URLs stay on the existing host. */
export function organizationJsonLd(locale: string): Record<string, unknown> {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: "https://aitcommunity.org",
    logo: "https://aitcommunity.org/logo.png",
    description: siteMetadataFor(locale).description,
  };
}
