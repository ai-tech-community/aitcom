import { describe, expect, it } from "vitest";

import { localeFromPathname, stripLocalePrefix } from "./locale-path";
import { resolveLocale } from "./messages";
import { siteRedirects } from "@/lib/site-redirects";
import { isUnlistedNewsGamePath } from "@/lib/news/indexability";
import {
  aiToolsHubPageHref,
  aiToolsHubProfileHref,
} from "@/lib/investigations/ai-tools-list";
import { startupsInsightsShareUrl } from "@/lib/investigations/startups";
import { hostedEventUrl } from "@/lib/events/public-events";
import { EVENT_HUB_HREFS } from "@/components/events/event-hub-links";
import {
  localeFromCookieHeader,
  hubDmMailCopy,
  isHubMailLocale,
} from "@/server/notifications/hub-dm-mail-copy";
import { postAnnouncementCopy } from "@/server/notifications/post-announcement-copy";
import { postMentionMailCopy } from "@/server/notifications/post-mention-mail-copy";

describe("French locale boundaries", () => {
  it("recognizes French and falls back safely for unsupported input", () => {
    expect(resolveLocale("fr")).toBe("fr");
    expect(resolveLocale("de")).toBe("en");
    expect(localeFromPathname("/fr/dashboard")).toBe("fr");
    expect(stripLocalePrefix("/fr/dashboard")).toBe("/dashboard");
    expect(stripLocalePrefix("/fr")).toBe("/");
    expect(localeFromPathname("/french/dashboard")).toBeUndefined();
    expect(stripLocalePrefix("/french/dashboard")).toBe("/french/dashboard");
  });

  it("keeps French public links in French", () => {
    expect(aiToolsHubPageHref("fr", 2)).toContain(
      "/fr/startups/ai-tools-list?page=2",
    );
    expect(aiToolsHubProfileHref("fr", "acme")).toBe("/fr/startups/acme");
    expect(startupsInsightsShareUrl("fr")).toContain("/fr/startups/insights");
    expect(hostedEventUrl({ slug: "ai-night" }, "fr")).toContain(
      "/fr/events/ai-night",
    );
    expect(EVENT_HUB_HREFS.fr).toHaveLength(4);
    expect(EVENT_HUB_HREFS.fr.every((href) => href.startsWith("/fr/"))).toBe(
      true,
    );
  });

  it("retains news indexing exclusions and retired-section redirects", () => {
    expect(isUnlistedNewsGamePath("/fr/news/stories/example")).toBe(true);
    for (const redirect of siteRedirects) {
      expect(redirect.source).toContain("(en|nl|fr)");
      expect(redirect.destination).toMatch(/^\/:locale/);
    }
  });

  it("uses French notification text and recognizes the locale cookie", () => {
    expect(
      localeFromCookieHeader("session=secret; NEXT_LOCALE=fr; theme=dark"),
    ).toBe("fr");
    expect(localeFromCookieHeader("OTHER_NEXT_LOCALE=fr")).toBe("en");
    expect(isHubMailLocale("fr")).toBe(true);
    expect(isHubMailLocale("de")).toBe(false);
    expect(hubDmMailCopy("fr").cta).toBe("Ouvrir le Hub");
    expect(
      postMentionMailCopy("fr", {
        authorName: "Alice",
        communityName: "Paris",
        isVideo: false,
      }).manage,
    ).toBe("Gérer les notifications");
    expect(
      postAnnouncementCopy("fr", {
        authorName: "Alice",
        communityName: "Paris",
        text: "",
        isVideo: false,
      }).subject,
    ).toBe("Alice a publié dans Paris");
  });
});
