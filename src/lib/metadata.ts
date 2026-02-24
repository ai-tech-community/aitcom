import type { Metadata } from "next";

const BASE_URL = "https://aitcommunity.org";

export function buildAlternates(path: string) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return {
    canonical: `${BASE_URL}/en${cleanPath}`,
    languages: {
      en: `${BASE_URL}/en${cleanPath}`,
      nl: `${BASE_URL}/nl${cleanPath}`,
      "x-default": `${BASE_URL}/en${cleanPath}`,
    },
  };
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
