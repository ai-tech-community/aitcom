import { describe, expect, it } from "vitest";

import { renderHubDigestHtml } from "./render";

describe("renderHubDigestHtml", () => {
  it("links 'Manage notifications' to the email preferences on Settings", () => {
    const html = renderHubDigestHtml({
      userId: "u1",
      sections: [],
      discovery: { slug: "makers", name: "Makers" },
    } as Parameters<typeof renderHubDigestHtml>[0]);

    expect(html).toContain(
      'href="https://www.aitcommunity.org/en/dashboard/settings#notifications"',
    );
    expect(html).not.toContain("/dashboard/notifications");
  });
});
