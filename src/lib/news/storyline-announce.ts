import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";

import type { StorylineMailEnv } from "./storyline-draft-review";

/** Environment the announcement cron reads. Fan-out needs no extra flag. */
export type StorylineAnnounceEnv = StorylineMailEnv;

/**
 * Production emails every member who has not opted out.
 * Preview, local, and test runs do not.
 */
export function storylineAnnounceFanoutEnabled(
  env: StorylineAnnounceEnv,
): boolean {
  return env.VERCEL_ENV === "production" && env.NODE_ENV === "production";
}

export function storylinePublicUrl(slug: string): string {
  return `${CANONICAL_PRODUCTION_ORIGIN}/en/news/stories/${encodeURIComponent(slug)}`;
}

export function storylineUnsubscribeUrl(token: string): string {
  return `${CANONICAL_PRODUCTION_ORIGIN}/en/unsubscribe?t=${encodeURIComponent(token)}`;
}

/** Stories published before `published_at` existed stay null and are not mailed. */
export function storylineAwaitingAnnouncement(story: {
  status: string;
  publishedAt: Date | null;
  announcedAt: Date | null;
}): boolean {
  return (
    story.status === "published" &&
    story.publishedAt != null &&
    story.announcedAt == null
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Title, the story's stored overview, and the public link.
 * An empty overview is left out. Nothing here is generated.
 */
export function renderStorylineAnnounceEmail(opts: {
  title: string;
  summary: string;
  storyUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string; text: string } {
  const title = opts.title.trim() || "A news story";
  const summary = opts.summary.trim();
  const lines = [title, ""];
  if (summary) lines.push(summary, "");
  lines.push(
    opts.storyUrl,
    "",
    `Unsubscribe: ${opts.unsubscribeUrl}`,
    "",
    "AIT Community",
  );
  const summaryHtml = summary ? `<p>${escapeHtml(summary)}</p>` : "";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #111; max-width: 600px; margin: 0 auto;">
      <h2 style="font-size: 18px;">${escapeHtml(title)}</h2>
      ${summaryHtml}
      <p style="margin-top: 24px;">
        <a href="${escapeHtml(opts.storyUrl)}" style="color: #111; font-weight: bold;">Read the story →</a>
      </p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
      <p style="font-size: 13px; color: #595959;">
        <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color: #595959;">Unsubscribe</a>
        · AIT Community
      </p>
    </div>`;
  return { subject: title, html, text: lines.join("\n") };
}
