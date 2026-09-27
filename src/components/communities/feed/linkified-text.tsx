"use client";

import { useTranslations } from "next-intl";

import { splitTextIntoLinks } from "@/lib/links";

/** rel for links members write: no opener access, no referrer, no SEO credit. */
export const USER_LINK_REL = "noopener noreferrer nofollow ugc";

/**
 * Plain user text with its web links made clickable. Links open in a new tab;
 * everything else renders as text, so no user markup ever reaches the DOM.
 */
export function LinkifiedText({ text }: { text: string }) {
  const t = useTranslations("communities.feed");
  return (
    <>
      {splitTextIntoLinks(text).map((segment, index) =>
        segment.kind === "link" ? (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel={USER_LINK_REL}
            className="text-primary [overflow-wrap:anywhere] underline-offset-4 hover:underline"
          >
            {segment.text}
            <span className="sr-only"> ({t("linkOpensInNewTab")})</span>
          </a>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}
