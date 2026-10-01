import type { HubMailLocale } from "./hub-dm-mail-copy";

/** The longest piece of the post in the subject line. */
const MAX_SUBJECT_TEXT = 80;

/** A member-chosen name on one line (a subject line must not break). */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The words of an "@everyone" announcement: a subject that leads with the
 * post's first line (without the "@everyone" itself), the post's text, why
 * the member gets it, and the label of the way in. Names are flattened to
 * one line; an empty post gets a plain subject.
 */
export function postAnnouncementCopy(
  locale: HubMailLocale,
  post: {
    authorName: string;
    communityName: string;
    /** The post as plain text (no formatting marks). */
    text: string;
    isVideo: boolean;
  },
) {
  const author = oneLine(post.authorName);
  const community = oneLine(post.communityName);
  const firstLine = oneLine(
    (post.text.split("\n").find((line) => line.trim()) ?? "")
      .replace(/(^|\s)@everyone\b[:,]?/g, "$1")
      .trim(),
  );
  const lead = firstLine ? clip(firstLine, MAX_SUBJECT_TEXT) : "";
  if (locale === "nl") {
    return {
      subject: lead
        ? `${author} in ${community}: ${lead}`
        : `${author} plaatste een bericht in ${community}`,
      why: `Je krijgt dit omdat je lid bent van ${community}. Aankondigingen van deze community kun je uitzetten in je meldingsinstellingen.`,
      cta: post.isVideo ? "Bekijk de video" : "Open de feed",
    };
  }
  return {
    subject: lead
      ? `${author} in ${community}: ${lead}`
      : `${author} posted in ${community}`,
    why: `You're getting this because you're a member of ${community}. You can turn off this community's announcements in your notification settings.`,
    cta: post.isVideo ? "Watch the video" : "Open the feed",
  };
}
