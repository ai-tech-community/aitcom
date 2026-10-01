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
      cta: mail.isVideo ? "Bekijk de video" : "Open het bericht",
      manage: "Meldingen beheren",
    };
  }
  return {
    subject: `${authorName} mentioned you in ${communityName}`,
    body: `${authorName} mentioned you in ${mail.isVideo ? "a video" : "a post"} in ${communityName}.`,
    cta: mail.isVideo ? "Watch the video" : "Open the post",
    manage: "Manage notifications",
  };
}

/**
 * Link-only mention email: names who and where, never the post's text, like
 * the Hub DM ping. Member-chosen names are escaped. The footer leads to the
 * switch that turns these emails off.
 */
export function renderPostMentionHtml(
  locale: HubMailLocale,
  mail: PostMentionMail,
  urls: { post: string; manage: string },
): string {
  const copy = postMentionMailCopy(locale, mail);
  return `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <p>${escapeHtml(copy.body)}</p>
        <p style="margin-top: 24px;">
          <a href="${escapeHtml(urls.post)}" style="color: #000; font-weight: bold;">
            ${escapeHtml(copy.cta)} →
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">
          AIT Community ·
          <a href="${escapeHtml(urls.manage)}" style="color:#999;">${escapeHtml(copy.manage)}</a>
        </p>
      </div>
    `;
}
