import { escapeHtml } from "@/server/email-template";

import type { HubMailLocale } from "./hub-dm-mail-copy";

/** What a mention email says: who, where, and the way back in. */
export type PostMentionMail = {
  authorName: string;
  communityName: string;
  /** A video post opens on its reel; a text post on the community feed. */
  isVideo: boolean;
};

/** A member-chosen name on one line (a subject line must not break). */
function oneLine(text: string): string {
  return text.replace(/[\r\n\t]+/g, " ").trim();
}

export function postMentionMailCopy(
  locale: HubMailLocale,
  mail: PostMentionMail,
) {
  const authorName = oneLine(mail.authorName);
  const communityName = oneLine(mail.communityName);
  if (locale === "nl") {
    return {
      subject: `${authorName} noemde je in ${communityName}`,
      body: `${authorName} noemde je in ${mail.isVideo ? "een video" : "een bericht"} in ${communityName}.`,
      // Text posts have no page of their own yet: the link opens the feed.
      cta: mail.isVideo ? "Bekijk de video" : "Open de feed",
      manage: "Meldingen beheren",
    };
  }
  return {
    subject: `${authorName} mentioned you in ${communityName}`,
    body: `${authorName} mentioned you in ${mail.isVideo ? "a video" : "a post"} in ${communityName}.`,
    cta: mail.isVideo ? "Watch the video" : "Open the feed",
    manage: "Manage notifications",
  };
}

/** Body text: a plain system sans (human words are not mono). */
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Link-only mention email: names who and where, never the post's text, like
 * the Hub DM ping. Member-chosen names are escaped. The footer (4.5:1
 * contrast) leads to the switch that turns these emails off; the arrow is
 * hidden from screen readers; `lang` names the language.
 */
export function renderPostMentionHtml(
  locale: HubMailLocale,
  mail: PostMentionMail,
  urls: { post: string; manage: string },
): string {
  const copy = postMentionMailCopy(locale, mail);
  return `
      <div lang="${locale}" style="font-family: ${SANS}; font-size: 15px; line-height: 1.5; color: #111; max-width: 600px; margin: 0 auto;">
        <p>${escapeHtml(copy.body)}</p>
        <p style="margin-top: 24px;">
          <a href="${escapeHtml(urls.post)}" style="color: #111; font-weight: bold;">${escapeHtml(copy.cta)}<span aria-hidden="true"> →</span></a>
        </p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
        <p style="font-size: 13px; color: #595959;">
          AIT Community ·
          <a href="${escapeHtml(urls.manage)}" style="color: #595959;">${escapeHtml(copy.manage)}</a>
        </p>
      </div>
    `;
}

/** The same email as plain text, for mail apps that show no HTML. */
export function renderPostMentionText(
  locale: HubMailLocale,
  mail: PostMentionMail,
  urls: { post: string; manage: string },
): string {
  const copy = postMentionMailCopy(locale, mail);
  return [
    copy.body,
    "",
    `${copy.cta}: ${urls.post}`,
    "",
    "—",
    `AIT Community · ${copy.manage}: ${urls.manage}`,
  ].join("\n");
}
