import type { HubDigest } from "./digest";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render the consolidated digest as inline-HTML (English; per-member locale is
 *  deferred — no locale field exists yet). */
export function renderHubDigestHtml(digest: HubDigest): string {
  const baseUrl = "https://www.aitcommunity.org";

  const sections = digest.sections
    .map((s) => {
      const lines: string[] = [];
      if (s.newThreads) lines.push(`${s.newThreads} new discussion(s)`);
      if (s.newEvents) lines.push(`${s.newEvents} new event(s)`);
      if (s.newMembers) lines.push(`${s.newMembers} new member(s)`);
      for (const item of s.ritualItems) lines.push(esc(item));
      return `
        <div style="margin: 20px 0; padding-bottom: 16px; border-bottom: 1px solid #eee;">
          <h3 style="font-size: 15px; margin: 0 0 8px;">${esc(s.communityName)}</h3>
          <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #333;">
            ${lines.map((l) => `<li>${l}</li>`).join("")}
          </ul>
        </div>`;
    })
    .join("");

  const discoveryHtml = digest.discovery
    ? `<p style="margin-top:16px;font-size:14px;color:#555;">Discover another community you might like: <a href="${baseUrl}/communities/${esc(digest.discovery.slug)}">${esc(digest.discovery.name)}</a></p>`
    : "";

  return `
    <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
      <h2 style="font-size: 18px;">Your weekly AIT digest</h2>
      <p style="font-size: 14px; color: #555;">Here's what happened across your communities this week.</p>
      ${sections}
      ${discoveryHtml}
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="font-size: 12px; color: #999;">
        AIT Community ·
        <a href="${baseUrl}/en/dashboard/notifications" style="color:#999;">Manage notifications</a>
      </p>
    </div>`;
}
