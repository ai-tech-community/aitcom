import { describe, expect, it } from "vitest";

import { digestCampaign, digestLink, digestSendDate } from "./digest-link";

const MONDAY = new Date("2026-10-12T14:00:00.000Z");

describe("digestSendDate", () => {
  it("uses the Monday of the send week in UTC", () => {
    expect(digestSendDate(MONDAY)).toBe("2026-10-12");
    expect(digestSendDate(new Date("2026-10-14T09:30:00.000Z"))).toBe(
      "2026-10-12",
    );
    expect(digestSendDate(new Date("2026-10-11T23:00:00.000Z"))).toBe(
      "2026-10-05",
    );
  });
});

describe("digestLink", () => {
  it("tags a relative AIT path with the canonical host and weekly campaign", () => {
    const url = new URL(digestLink("/en/communities/makers", MONDAY));

    expect(url.origin).toBe("https://www.aitcommunity.org");
    expect(url.pathname).toBe("/en/communities/makers");
    expect(url.searchParams.get("utm_source")).toBe("digest");
    expect(url.searchParams.get("utm_medium")).toBe("email");
    expect(url.searchParams.get("utm_campaign")).toBe("weekly-2026-10-12");
    expect(digestCampaign(MONDAY)).toBe("weekly-2026-10-12");
  });

  it("keeps a hash and existing query params beside the campaign", () => {
    const url = new URL(digestLink("/en/unsubscribe?t=abc_def-123", MONDAY));

    expect(url.searchParams.get("t")).toBe("abc_def-123");
    expect(url.searchParams.get("utm_campaign")).toBe("weekly-2026-10-12");

    const settings = new URL(
      digestLink("/en/dashboard/settings#notifications", MONDAY),
    );
    expect(settings.hash).toBe("#notifications");
    expect(settings.searchParams.get("utm_source")).toBe("digest");
  });

  it("rewrites apex and http AIT hosts onto the canonical https www host", () => {
    const url = new URL(
      digestLink("http://aitcommunity.org/en/events/demo", MONDAY),
    );

    expect(
      url.href.startsWith("https://www.aitcommunity.org/en/events/demo?"),
    ).toBe(true);
    expect(url.searchParams.get("utm_medium")).toBe("email");
  });

  it("leaves outside articles and non-http links untagged", () => {
    const article = "https://example.com/story?id=1";
    expect(digestLink(article, MONDAY)).toBe(article);
    expect(digestLink("mailto:info@klevox.com", MONDAY)).toBe(
      "mailto:info@klevox.com",
    );
  });
});
