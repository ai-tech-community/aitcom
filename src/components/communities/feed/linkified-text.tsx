"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { splitTextIntoLinks } from "@/lib/links";
import { splitMentions, type PostMention } from "@/lib/post-mentions";

/** A mention as shown: a link only when the member's profile is open. */
export type ShownMention = PostMention & { hasProfile?: boolean };

/**
 * Text with each "@Name" the post mentions shown as that member, in ink
 * (orange is kept for the one main action): a link to their profile,
 * always underlined so it reads as one without colour, or just the name in
 * medium weight when the profile is not open.
 */
function MentionedText({
  text,
  mentions,
}: {
  text: string;
  mentions: readonly ShownMention[];
}) {
  return (
    <>
      {splitMentions(text, mentions).map((part, index) =>
        !part.mention ? (
          <Fragment key={index}>{part.text}</Fragment>
        ) : part.mention.hasProfile ? (
          <Link
            key={index}
            href={`/members/${encodeURIComponent(part.mention.userId)}`}
            className="decoration-primary/60 hover:decoration-primary font-medium underline underline-offset-4"
          >
            {part.text}
          </Link>
        ) : (
          <span key={index} className="font-medium">
            {part.text}
          </span>
        ),
      )}
    </>
  );
}

/** rel for links members write: no opener access, no referrer, no SEO credit. */
export const USER_LINK_REL = "noopener noreferrer nofollow ugc";

/**
 * Plain user text with its web links made clickable and, when given, its
 * @mentions shown as members (never inside a link). Links open in a new
 * tab; everything else renders as text, so no user markup ever reaches the
 * DOM.
 */
export function LinkifiedText({
  text,
  mentions = [],
}: {
  text: string;
  mentions?: readonly ShownMention[];
}) {
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
          <MentionedText key={index} text={segment.text} mentions={mentions} />
        ),
      )}
    </>
  );
}
