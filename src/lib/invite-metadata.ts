import type { Metadata } from "next";

import { buildAlternates } from "@/lib/metadata";
import { siteMetadataFor, siteSocialMetadata } from "@/lib/site-metadata";

/** Invite-link preview. The path stays `/invite/<token>` under each locale. */
export function invitePageMetadata(locale: string, token: string): Metadata {
  const copy = siteMetadataFor(locale);
  return {
    title: { absolute: copy.title },
    description: copy.description,
    ...siteSocialMetadata(locale),
    alternates: buildAlternates(`/invite/${token}`, locale),
  };
}
