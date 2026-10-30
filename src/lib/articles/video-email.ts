import { escapeHtml } from "@/server/email-template";

import { resolveArticleVideo } from "./video-embed";

/**
 * A video block in mail: a thumbnail and a link, never an iframe.
 * Issue announcement mail does not include the article body; this is the
 * fragment to use when a body is mailed.
 */
export function articleVideoEmailHtml(url: string): string {
  const video = resolveArticleVideo(url);
  if (!video) return "";
  if (video.kind === "embed") {
    const href = escapeHtml(video.pageUrl);
    const label = escapeHtml(video.label);
    const thumb = video.thumbnailUrl
      ? `<a href="${href}"><img src="${escapeHtml(video.thumbnailUrl)}" alt="${label}" width="480" height="270" style="max-width:100%;height:auto;border:0;display:block;" /></a>`
      : "";
    return `${thumb}<p><a href="${href}">Watch on ${label}</a></p>`;
  }
  const href = escapeHtml(video.href);
  const text = escapeHtml(video.title || video.label);
  return `<p><a href="${href}">${text}</a></p>`;
}
