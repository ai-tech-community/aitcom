import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { routing } from "@/i18n/routing";
import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";

export const CANONICAL_SITE_ORIGIN = CANONICAL_PRODUCTION_ORIGIN;

type AppLocale = (typeof routing.locales)[number];

function resolveLocale(locale: string): AppLocale {
  return routing.locales.includes(locale as AppLocale)
    ? (locale as AppLocale)
    : routing.defaultLocale;
}

function pathSuffix(path: string) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return cleanPath === "/" ? "" : cleanPath;
}

export function absoluteLocaleUrl(locale: string, path: string) {
  return `${CANONICAL_SITE_ORIGIN}/${resolveLocale(locale)}${pathSuffix(path)}`;
}

export function buildAlternates(path: string, locale: string) {
  const resolved = resolveLocale(locale);
  return {
    canonical: absoluteLocaleUrl(resolved, path),
    languages: {
      en: absoluteLocaleUrl("en", path),
      nl: absoluteLocaleUrl("nl", path),
      "x-default": absoluteLocaleUrl(routing.defaultLocale, path),
    },
  };
}

export async function localeAlternates(path: string) {
  return buildAlternates(path, await getLocale());
}

export function buildOgMeta(
  title: string,
  description: string,
  subtitle?: string,
): Pick<Metadata, "openGraph" | "twitter"> {
  const ogImageParams = new URLSearchParams({
    title,
    subtitle: subtitle ?? "AIT Community",
  });
  return {
    openGraph: {
      title,
      description,
      siteName: "AIT Community",
      type: "website",
      images: [`/en/og?${ogImageParams.toString()}`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/en/og?${ogImageParams.toString()}`],
    },
  };
}
