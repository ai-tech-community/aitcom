import type { Media, Sponsor } from "@/payload-types";

/** What the homepage sponsor block needs from a sponsor. */
export interface HomeSponsor {
  id: number;
  name: string;
  /** Absolute http(s) URL, or null: the sponsor is then shown without a link. */
  href: string | null;
  logoUrl: string | null;
}

/** From this many sponsors on, the block shows a row of logos. */
export const SPONSOR_ROW_MIN = 3;

/**
 * A sponsor's website as a safe outbound link, or null. Editors type
 * websites by hand, so "acme.ai" gets https:// in front; anything that is
 * not an http(s) address (empty, "#", "javascript:…", free text) gives
 * null, and the sponsor is shown as plain text instead of a dead link.
 */
export function sponsorHref(website: string | null | undefined): string | null {
  const raw = website?.trim();
  if (!raw) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Payload sponsor (logo populated at depth 1, or just its id) → block input. */
export function toHomeSponsor(
  doc: Pick<Sponsor, "id" | "name" | "website" | "logo">,
): HomeSponsor {
  const logo: Media | null = typeof doc.logo === "object" ? doc.logo : null;
  return {
    id: doc.id,
    name: doc.name,
    href: sponsorHref(doc.website),
    logoUrl: logo?.url ?? null,
  };
}
