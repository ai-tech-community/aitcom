import { describe, expect, it } from "vitest";

import { renderHubDigestHtml, renderHubDigestText } from "./render";

const SEND = new Date("2026-10-12T14:00:00.000Z");

const digest = {
  userId: "u1",
  sections: [
    {
      communityId: "c1",
      communityName: "Makers & Co",
      newThreads: 2,
      newEvents: 0,
      newMembers: 1,
      ritualItems: ["Show & tell"],
      highlights: [
        {
          title: "Ship notes",
          path: "/en/communities/makers/forum/ship-notes",
          kind: "thread",
        },
      ],
      isEmpty: false,
    },
  ],
  news: [],
  events: [
    {
      title: "Office hours",
      path: "/en/events/office-hours",
      when: "2026-10-14",
    },
  ],
  jobs: [],
  startups: [],
  discovery: { slug: "makers", name: "Makers" },
} as Parameters<typeof renderHubDigestHtml>[0];

describe("renderHubDigestHtml", () => {
  it("tags AIT links with the Monday campaign and escapes them", () => {
    const html = renderHubDigestHtml(digest, SEND);
    const manage =
      "https://www.aitcommunity.org/en/dashboard/settings?utm_source=digest&amp;utm_medium=email&amp;utm_campaign=weekly-2026-10-12#notifications";

    expect(html).toContain(`href="${manage}"`);
    expect(html).toContain("Manage notifications");
    expect(html).toContain("Choose sections");
    expect(html).toContain("Community");
    expect(html).toContain("Makers &amp; Co");
    expect(html).toContain("Ship notes");
    expect(html).toContain("Show &amp; tell");
    expect(html).toContain("Events");
    expect(html).toContain("Office hours");
    expect(html).not.toContain("Jobs");
    expect(html).not.toContain("new discussion");
    expect(html).toContain(
      "https://www.aitcommunity.org/en/communities/makers/forum/ship-notes?utm_source=digest&amp;utm_medium=email&amp;utm_campaign=weekly-2026-10-12",
    );
    expect(html).not.toContain("/dashboard/notifications");
    expect(html).toContain(
      "https://www.aitcommunity.org/en/communities/makers?utm_source=digest&amp;utm_medium=email&amp;utm_campaign=weekly-2026-10-12",
    );
  });
});

describe("renderHubDigestText", () => {
  it("carries the same canonical tagged links as the HTML", () => {
    const text = renderHubDigestText(digest, SEND);

    expect(text).toContain("Your weekly AIT digest");
    expect(text).toContain("Community");
    expect(text).toContain("Makers & Co");
    expect(text).toContain("- Ship notes");
    expect(text).toContain(
      "https://www.aitcommunity.org/en/communities/makers/forum/ship-notes?utm_source=digest&utm_medium=email&utm_campaign=weekly-2026-10-12",
    );
    expect(text).toContain("- Show & tell");
    expect(text).toContain("Events");
    expect(text).toContain("- Office hours · 2026-10-14");
    expect(text).not.toContain("Jobs");
    expect(text).not.toContain("new discussion");
    expect(text).toContain(
      "Manage notifications: https://www.aitcommunity.org/en/dashboard/settings?utm_source=digest&utm_medium=email&utm_campaign=weekly-2026-10-12#notifications",
    );
    expect(text).toContain(
      "Choose sections: https://www.aitcommunity.org/en/dashboard/settings?utm_source=digest&utm_medium=email&utm_campaign=weekly-2026-10-12#notifications",
    );
    expect(text).toContain(
      "https://www.aitcommunity.org/en/communities/makers?utm_source=digest&utm_medium=email&utm_campaign=weekly-2026-10-12",
    );
    expect(text).not.toContain("<a ");
  });

  it("links a story to the article without a tag and to /news with the campaign", () => {
    const html = renderHubDigestHtml(
      {
        ...digest,
        sections: [],
        events: [],
        news: [
          {
            id: "story-1",
            title: "New models",
            summary: "Two sentences.",
            articleUrl: "https://example.com/models?id=1",
            path: "/en/news#news-story-1",
          },
        ],
      },
      SEND,
    );
    const text = renderHubDigestText(
      {
        ...digest,
        sections: [],
        events: [],
        news: [
          {
            id: "story-1",
            title: "New models",
            summary: "Two sentences.",
            articleUrl: "https://example.com/models?id=1",
            path: "/en/news#news-story-1",
          },
        ],
      },
      SEND,
    );
    expect(html).toContain('href="https://example.com/models?id=1"');
    expect(html).not.toContain("https://example.com/models?id=1&amp;");
    expect(html).toContain(
      "https://www.aitcommunity.org/en/news?utm_source=digest&amp;utm_medium=email&amp;utm_campaign=weekly-2026-10-12#news-story-1",
    );
    expect(text).toContain("https://example.com/models?id=1\n");
    expect(text).not.toContain("https://example.com/models?id=1&");
    expect(text).toContain(
      "On AIT: https://www.aitcommunity.org/en/news?utm_source=digest&utm_medium=email&utm_campaign=weekly-2026-10-12#news-story-1",
    );
  });

  it("tags the unsubscribe page and keeps the token out of the campaign", () => {
    const token = "abc_def-123.sig";
    const html = renderHubDigestHtml(digest, SEND, {
      unsubscribeToken: token,
    });
    const text = renderHubDigestText(digest, SEND, {
      unsubscribeToken: token,
    });
    const href =
      "https://www.aitcommunity.org/en/unsubscribe?t=abc_def-123.sig&amp;utm_source=digest&amp;utm_medium=email&amp;utm_campaign=weekly-2026-10-12";

    expect(html).toContain(`href="${href}"`);
    expect(html).toContain("Unsubscribe from digest");
    expect(text).toContain(
      "Unsubscribe from digest: https://www.aitcommunity.org/en/unsubscribe?t=abc_def-123.sig&utm_source=digest&utm_medium=email&utm_campaign=weekly-2026-10-12",
    );
  });
});
