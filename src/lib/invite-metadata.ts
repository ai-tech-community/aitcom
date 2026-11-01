import type { Metadata } from "next";

import { siteMetadataFor, siteSocialMetadata } from "@/lib/site-metadata";

/** Invite-link preview. The path stays `/invite/<token>` under each locale. */
export function invitePageMetadata(locale: string, token: string): Metadata {
  const copy = siteMetadataFor(locale);
  return {
    title: { absolute: copy.title },
    description: copy.description,
    ...siteSocialMetadata(locale),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    alternates: { canonical: "https://www.aitcommunity.org/en/join" },
  };
}
