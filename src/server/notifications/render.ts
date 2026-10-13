import { NOTIFICATION_SETTINGS_HREF } from "@/lib/dashboard-routes";

import { digestLink } from "./digest-link";
import type { HubDigest } from "./digest";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sectionLines(section: HubDigest["sections"][number]): string[] {
  const lines: string[] = [];
  if (section.newThreads) lines.push(`${section.newThreads} new discussion(s)`);
  if (section.newEvents) lines.push(`${section.newEvents} new event(s)`);
  if (section.newMembers) lines.push(`${section.newMembers} new member(s)`);
  for (const item of section.ritualItems) lines.push(item);
  return lines;
}

/** Render the consolidated digest as inline-HTML (English; per-member locale is
 *  deferred — no locale field exists yet). AIT links carry this week's campaign. */
export function renderHubDigestHtml(digest: HubDigest, sendDate: Date): string {
  const sections = digest.sections
    .map((s) => {
      const lines = sectionLines(s);
      return `
        <div style="margin: 20px 0; padding-bottom: 16px; border-bottom: 1px solid #eee;">
          <h3 style="font-size: 15px; margin: 0 0 8px;">${esc(s.communityName)}</h3>
          <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #333;">
            ${lines.map((l) => `<li>${esc(l)}</li>`).join("")}
          </ul>
        </div>`;
    })
    .join("");

  const discoveryHtml = digest.discovery
    ? `<p style="margin-top:16px;font-size:14px;color:#555;">Discover another community you might like: <a href="${esc(digestLink(`/en/communities/${encodeURIComponent(digest.discovery.slug)}`, sendDate))}">${esc(digest.discovery.name)}</a></p>`
    : "";

  const manage = digestLink(`/en${NOTIFICATION_SETTINGS_HREF}`, sendDate);

  return `
    <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
      <h2 style="font-size: 18px;">Your weekly AIT digest</h2>
      <p style="font-size: 14px; color: #555;">Here's what happened across your communities this week.</p>
      ${sections}
      ${discoveryHtml}
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="font-size: 12px; color: #999;">
        AIT Community ·
        <a href="${esc(manage)}" style="color:#999;">Manage notifications</a>
      </p>
    </div>`;
}

/** Plain-text part. Same links as the HTML, without tags. */
export function renderHubDigestText(digest: HubDigest, sendDate: Date): string {
  const lines: string[] = [
    "Your weekly AIT digest",
    "",
    "Here's what happened across your communities this week.",
    "",
  ];

  for (const section of digest.sections) {
    lines.push(section.communityName);
    for (const line of sectionLines(section)) lines.push(`- ${line}`);
    lines.push("");
  }

  if (digest.discovery) {
    lines.push(
      `Discover another community you might like: ${digest.discovery.name}`,
    );
    lines.push(
      digestLink(
        `/en/communities/${encodeURIComponent(digest.discovery.slug)}`,
        sendDate,
      ),
    );
    lines.push("");
  }

  lines.push("—");
  lines.push(
    `AIT Community · Manage notifications: ${digestLink(`/en${NOTIFICATION_SETTINGS_HREF}`, sendDate)}`,
  );
  return lines.join("\n");
}
