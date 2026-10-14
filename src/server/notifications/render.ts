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

export type DigestRenderOptions = {
  /** Signed token. When set, the footer links to the confirm page. */
  unsubscribeToken?: string;
};

type Line = { text: string; path?: string };

function communityLines(section: HubDigest["sections"][number]): Line[] {
  const lines: Line[] = [];
  for (const item of section.highlights ?? []) {
    lines.push({ text: item.title, path: item.path });
  }
  for (const item of section.ritualItems) lines.push({ text: item });
  return lines;
}

function linkedHtml(line: Line, sendDate: Date): string {
  if (!line.path) return esc(line.text);
  return `<a href="${esc(digestLink(line.path, sendDate))}">${esc(line.text)}</a>`;
}

function itemBlock(title: string, lines: Line[], sendDate: Date): string {
  if (lines.length === 0) return "";
  return `
        <h3 style="font-size: 15px; margin: 24px 0 8px;">${esc(title)}</h3>
        <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #333;">
          ${lines.map((line) => `<li>${linkedHtml(line, sendDate)}</li>`).join("")}
        </ul>`;
}

function appendTextBlock(
  lines: string[],
  title: string,
  items: Line[],
  sendDate: Date,
): void {
  if (items.length === 0) return;
  lines.push(title);
  for (const item of items) {
    lines.push(`- ${item.text}`);
    if (item.path) lines.push(`  ${digestLink(item.path, sendDate)}`);
  }
  lines.push("");
}

function footerUrls(sendDate: Date, token?: string) {
  const settings = digestLink(`/en${NOTIFICATION_SETTINGS_HREF}`, sendDate);
  const unsubscribe = token
    ? digestLink(`/en/unsubscribe?t=${encodeURIComponent(token)}`, sendDate)
    : null;
  return { settings, unsubscribe };
}

/** Render the consolidated digest as inline-HTML (English; per-member locale is
 *  deferred — no locale field exists yet). AIT links carry this week's campaign. */
export function renderHubDigestHtml(
  digest: HubDigest,
  sendDate: Date,
  options?: DigestRenderOptions,
): string {
  const news = digest.news ?? [];
  const events = digest.events ?? [];
  const jobs = digest.jobs ?? [];
  const startups = digest.startups ?? [];
  const newsHtml =
    news.length === 0
      ? ""
      : `<h3 style="font-size: 15px; margin: 24px 0 8px;">TL;DR</h3>
      <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #333;">
        ${news
          .map(
            (item) => `<li style="margin: 0 0 12px;">
            <a href="${esc(item.articleUrl)}">${esc(item.title)}</a>
            <div style="color:#555; margin-top: 4px;">${esc(item.summary)}</div>
            <div style="margin-top: 4px;"><a href="${esc(digestLink(item.path, sendDate))}">On AIT</a></div>
          </li>`,
          )
          .join("")}
      </ul>`;

  const communityHtml =
    digest.sections.length === 0
      ? ""
      : `<h3 style="font-size: 15px; margin: 24px 0 8px;">Community</h3>
      ${digest.sections
        .map((section) => {
          const lines = communityLines(section);
          return `
        <div style="margin: 12px 0; padding-bottom: 12px; border-bottom: 1px solid #eee;">
          <h4 style="font-size: 14px; margin: 0 0 8px;">${esc(section.communityName)}</h4>
          <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #333;">
            ${lines.map((line) => `<li>${linkedHtml(line, sendDate)}</li>`).join("")}
          </ul>
        </div>`;
        })
        .join("")}`;

  const eventsHtml = itemBlock(
    "Events",
    events.map((event) => ({
      text: `${event.title} · ${event.when}`,
      path: event.path,
    })),
    sendDate,
  );
  const jobsHtml = itemBlock(
    "Jobs",
    jobs.map((job) => ({
      text: `${job.title} — ${job.company}`,
      path: job.path,
    })),
    sendDate,
  );
  const contributors = (digest.contributors ?? []).slice(0, 3);
  const contributorsHtml = itemBlock(
    "Contributors",
    contributors.map((contributor) => ({
      text: `${contributor.name} · ${contributor.points}`,
      path: contributor.path,
    })),
    sendDate,
  );
  const startupsHtml = itemBlock(
    "Startups",
    startups.map((startup) => ({
      text: `${startup.title} · ${startup.votes} votes`,
      path: startup.path,
    })),
    sendDate,
  );

  const discoveryHtml = digest.discovery
    ? `<p style="margin-top:16px;font-size:14px;color:#555;">Discover another community you might like: <a href="${esc(digestLink(`/en/communities/${encodeURIComponent(digest.discovery.slug)}`, sendDate))}">${esc(digest.discovery.name)}</a></p>`
    : "";

  const { settings, unsubscribe } = footerUrls(
    sendDate,
    options?.unsubscribeToken,
  );
  const unsubscribeHtml = unsubscribe
    ? ` · <a href="${esc(unsubscribe)}" style="color:#999;">Unsubscribe from digest</a>`
    : "";

  return `
    <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
      <h2 style="font-size: 18px;">Your weekly AIT digest</h2>
      <p style="font-size: 14px; color: #555;">Here's what happened across your communities this week.</p>
      ${newsHtml}
      ${communityHtml}
      ${eventsHtml}
      ${jobsHtml}
      ${startupsHtml}
      ${contributorsHtml}
      ${discoveryHtml}
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="font-size: 12px; color: #999;">
        AIT Community ·
        <a href="${esc(settings)}" style="color:#999;">Manage notifications</a>
        ·
        <a href="${esc(settings)}" style="color:#999;">Choose sections</a>${unsubscribeHtml}
      </p>
    </div>`;
}

/** Plain-text part. Same links as the HTML, without tags. */
export function renderHubDigestText(
  digest: HubDigest,
  sendDate: Date,
  options?: DigestRenderOptions,
): string {
  const lines: string[] = [
    "Your weekly AIT digest",
    "",
    "Here's what happened across your communities this week.",
    "",
  ];

  const news = digest.news ?? [];
  if (news.length > 0) {
    lines.push("TL;DR");
    for (const item of news) {
      lines.push(`- ${item.title}`);
      lines.push(`  ${item.summary}`);
      lines.push(`  ${item.articleUrl}`);
      lines.push(`  On AIT: ${digestLink(item.path, sendDate)}`);
    }
    lines.push("");
  }

  if (digest.sections.length > 0) {
    lines.push("Community");
    lines.push("");
    for (const section of digest.sections) {
      lines.push(section.communityName);
      for (const line of communityLines(section)) {
        lines.push(`- ${line.text}`);
        if (line.path) lines.push(`  ${digestLink(line.path, sendDate)}`);
      }
      lines.push("");
    }
  }

  appendTextBlock(
    lines,
    "Events",
    (digest.events ?? []).map((event) => ({
      text: `${event.title} · ${event.when}`,
      path: event.path,
    })),
    sendDate,
  );
  appendTextBlock(
    lines,
    "Jobs",
    (digest.jobs ?? []).map((job) => ({
      text: `${job.title} — ${job.company}`,
      path: job.path,
    })),
    sendDate,
  );
  appendTextBlock(
    lines,
    "Startups",
    (digest.startups ?? []).map((startup) => ({
      text: `${startup.title} · ${startup.votes} votes`,
      path: startup.path,
    })),
    sendDate,
  );
  appendTextBlock(
    lines,
    "Contributors",
    (digest.contributors ?? []).slice(0, 3).map((contributor) => ({
      text: `${contributor.name} · ${contributor.points}`,
      path: contributor.path,
    })),
    sendDate,
  );

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

  const { settings, unsubscribe } = footerUrls(
    sendDate,
    options?.unsubscribeToken,
  );
  lines.push("—");
  lines.push(`AIT Community · Manage notifications: ${settings}`);
  lines.push(`Choose sections: ${settings}`);
  if (unsubscribe) lines.push(`Unsubscribe from digest: ${unsubscribe}`);
  return lines.join("\n");
}
