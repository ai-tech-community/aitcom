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
      isEmpty: false,
    },
  ],
  discovery: { slug: "makers", name: "Makers" },
} as Parameters<typeof renderHubDigestHtml>[0];

describe("renderHubDigestHtml", () => {
  it("tags AIT links with the Monday campaign and escapes them", () => {
    const html = renderHubDigestHtml(digest, SEND);
    const manage =
      "https://www.aitcommunity.org/en/dashboard/settings?utm_source=digest&amp;utm_medium=email&amp;utm_campaign=weekly-2026-10-12#notifications";

    expect(html).toContain(`href="${manage}"`);
    expect(html).toContain("Manage notifications");
    expect(html).toContain("Makers &amp; Co");
    expect(html).toContain("Show &amp; tell");
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
    expect(text).toContain("Makers & Co");
    expect(text).toContain("- 2 new discussion(s)");
    expect(text).toContain("- 1 new member(s)");
    expect(text).toContain("- Show & tell");
    expect(text).toContain(
      "Manage notifications: https://www.aitcommunity.org/en/dashboard/settings?utm_source=digest&utm_medium=email&utm_campaign=weekly-2026-10-12#notifications",
    );
    expect(text).toContain(
      "https://www.aitcommunity.org/en/communities/makers?utm_source=digest&utm_medium=email&utm_campaign=weekly-2026-10-12",
    );
    expect(text).not.toContain("<a ");
  });
});
