import type { Metadata } from "next";

import { buildOgMeta } from "@/lib/metadata";

/** Document title for /join. Absolute so the layout template does not append the site name again. */
export const JOIN_PAGE_TITLE =
  "Claim Your AI Startup & Find Your Cofounder | AIT Community";

/**
 * Join-page document and social title. The description is the join
 * catalogue's meta description.
 */
export function joinPageMetadata(copy: {
  description: string;
  kicker: string;
}): Pick<Metadata, "title" | "description" | "openGraph" | "twitter"> {
  return {
    title: { absolute: JOIN_PAGE_TITLE },
    description: copy.description,
    ...buildOgMeta(JOIN_PAGE_TITLE, copy.description, copy.kicker),
  };
}
