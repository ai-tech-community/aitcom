import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { routing } from "@/i18n/routing";
import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";

import { invitePageMetadata } from "./invite-metadata";
import { buildAlternates } from "./metadata";
import {
  SITE_COPY,
  SITE_LOCALES,
  SITE_NAME,
  ogImageCopy,
  organizationJsonLd,
  siteImageSubtitle,
  siteLayoutMetadata,
  siteMetadataFor,
  siteOgImage,
  siteSocialMetadata,
} from "./site-metadata";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const EN_TITLE =
  "AIT Community – Communities, events and people building together";
const EN_DESCRIPTION =
  "Join local and online communities on AIT: meetups, language groups, forums, magazines, jobs and startups, with AI agents helping along the way.";

function source(path: string) {
  return readFileSync(join(srcRoot, path), "utf8");
}

describe("site metadata copy", () => {
  it("keeps the English title and description in one place", () => {
    expect(SITE_COPY.en.title).toBe(EN_TITLE);
    expect(SITE_COPY.en.description).toBe(EN_DESCRIPTION);
  });

  it("covers the same locales the site routes", () => {
    expect([...SITE_LOCALES]).toEqual([...routing.locales]);
    expect(siteMetadataFor(routing.defaultLocale)).toBe(SITE_COPY.en);
  });

  it.each(SITE_LOCALES)(
    "%s wording is a full title and a description that is not AI-only",
    (locale) => {
      const copy = siteMetadataFor(locale);
      expect(copy.title.startsWith(`${SITE_NAME} – `)).toBe(true);
      expect(copy.title).not.toContain("Engineers and AI Agents");
      expect(copy.description).not.toMatch(/technical innovators/i);
      expect(copy.description.length).toBeGreaterThan(40);
      expect(siteImageSubtitle(locale)).toBe(
        copy.title.slice(`${SITE_NAME} – `.length),
      );
    },
  );

  it("uses natural Dutch and French, not a copy of the English sentence", () => {
    expect(SITE_COPY.nl.title).toBe(
      "AIT Community – Communities, evenementen en mensen die samen bouwen",
    );
    expect(SITE_COPY.nl.description).toBe(
      "Sluit je aan bij lokale en online communities op AIT: meetups, taalgroepen, forums, magazines, vacatures en startups, met AI-agents die onderweg een handje helpen.",
    );
    expect(SITE_COPY.fr.title).toBe(
      "AIT Community – Communautés, événements et personnes qui construisent ensemble",
    );
    expect(SITE_COPY.fr.description).toBe(
      "Rejoignez des communautés locales et en ligne sur AIT : rencontres, groupes de langue, forums, magazines, emplois et startups, avec des agents IA qui donnent un coup de main.",
    );
    expect(SITE_COPY.nl.title).not.toBe(SITE_COPY.en.title);
    expect(SITE_COPY.fr.description).not.toBe(SITE_COPY.en.description);
  });

  it("falls back to English for an unknown locale", () => {
    expect(siteMetadataFor("de")).toEqual(SITE_COPY.en);
  });
});

describe("default document metadata", () => {
  it.each(SITE_LOCALES)(
    "%s default title, description, and OG image alt use the shared copy",
    (locale) => {
      const copy = SITE_COPY[locale];
      const meta = siteLayoutMetadata(locale);
      const image = siteOgImage(locale);

      expect(meta.title).toEqual({
        default: copy.title,
        template: `%s - ${SITE_NAME}`,
      });
      expect(meta.description).toBe(copy.description);
      expect(meta.openGraph).toMatchObject({
        siteName: SITE_NAME,
        type: "website",
        images: [image],
      });
      expect(meta.twitter).toMatchObject({
        card: "summary_large_image",
        images: [{ url: image.url, alt: copy.title }],
      });
      expect(image.alt).toBe(copy.title);
      expect(image.width).toBe(1200);
      expect(image.height).toBe(630);

      const card = new URL(image.url, CANONICAL_PRODUCTION_ORIGIN);
      expect(card.pathname).toBe(`/${locale}/og`);
      expect(card.searchParams.get("title")).toBe(SITE_NAME);
      expect(card.searchParams.get("subtitle")).toBe(siteImageSubtitle(locale));
      expect(card.searchParams.get("subtitle")).not.toContain(
        "Engineers and AI Agents",
      );
    },
  );

  it("leaves social title unset so child pages keep their own wording", () => {
    const meta = siteLayoutMetadata("en");
    expect(meta.openGraph).not.toHaveProperty("title");
    expect(meta.openGraph).not.toHaveProperty("description");
    expect(meta.twitter).not.toHaveProperty("title");
    expect(meta.twitter).not.toHaveProperty("description");
  });
});

describe("invite metadata", () => {
  it.each(SITE_LOCALES)(
    "%s invite preview uses the shared title, description, and card",
    (locale) => {
      const token = "3fcd564d8452";
      const copy = SITE_COPY[locale];
      const meta = invitePageMetadata(locale, token);
      const social = siteSocialMetadata(locale);

      expect(meta.title).toEqual({ absolute: copy.title });
      expect(meta.description).toBe(copy.description);
      expect(meta.openGraph).toMatchObject({
        title: copy.title,
        description: copy.description,
        siteName: SITE_NAME,
        images: [siteOgImage(locale)],
      });
      expect(meta.twitter).toEqual(social.twitter);
      expect(meta.robots).toEqual({ index: false, follow: false });
      expect(meta.alternates?.canonical).toBe(
        `${CANONICAL_PRODUCTION_ORIGIN}/en/join`,
      );
    },
  );
});

describe("default OG image text", () => {
  it("draws the localized subtitle when the card has no query", () => {
    expect(ogImageCopy("en", null, null)).toEqual({
      title: SITE_NAME,
      subtitle: "Communities, events and people building together",
    });
    expect(ogImageCopy("nl", "", "")).toEqual({
      title: SITE_NAME,
      subtitle: "Communities, evenementen en mensen die samen bouwen",
    });
    expect(ogImageCopy("fr", null, null).subtitle).toBe(
      "Communautés, événements et personnes qui construisent ensemble",
    );
  });

  it("keeps a page's own title and subtitle on the image", () => {
    expect(ogImageCopy("nl", "Dutch Together", "Utrecht")).toEqual({
      title: "Dutch Together",
      subtitle: "Utrecht",
    });
  });
});

describe("organization JSON-LD", () => {
  it.each(SITE_LOCALES)(
    "%s description matches the site description and keeps the existing URLs",
    (locale) => {
      expect(organizationJsonLd(locale)).toEqual({
        "@type": "Organization",
        name: SITE_NAME,
        url: "https://aitcommunity.org",
        logo: "https://aitcommunity.org/logo.png",
        description: SITE_COPY[locale].description,
      });
    },
  );
});

describe("metadata wiring", () => {
  it("reads the shared copy from the layout, invite page, OG image, and homepage", () => {
    const layout = source("app/[locale]/layout.tsx");
    const invite = source("app/[locale]/invite/[token]/page.tsx");
    const og = source("app/[locale]/og/route.tsx");
    const home = source("app/[locale]/page.tsx");

    expect(layout).toContain("siteLayoutMetadata");
    expect(invite).toContain("invitePageMetadata");
    expect(og).toContain("ogImageCopy");
    expect(home).toContain("organizationJsonLd");

    for (const file of [layout, invite, og, home]) {
      expect(file).not.toContain("Engineers and AI Agents");
      expect(file).not.toContain("technical innovators");
    }
  });
});
