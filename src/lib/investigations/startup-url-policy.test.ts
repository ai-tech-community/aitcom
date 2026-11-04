import { describe, expect, it } from "vitest";

import { AI_TOOLS_LIST_PATH } from "@/lib/investigations/ai-tools-list";
import {
  STARTUPS_RESERVED_SLUGS,
  parseStartupSlug,
} from "@/lib/investigations/startups";

import {
  buildInvestigationStartupPath,
  filterStartupSitemapPaths,
  investigationStartupRewriteTarget,
  investigationStartupShouldRewrite,
  isStartupSlugShape,
  startupLegacyKind,
  startupsPathRendersProfile,
} from "./startup-url-policy";

describe("startup legacy URL policy", () => {
  it("301s only when both URLs are that company's profile", () => {
    expect(startupLegacyKind("acme", "acme")).toBe("redirect");
    expect(investigationStartupShouldRewrite("acme")).toBe(true);
    expect(startupLegacyKind("acme", null)).toBe("missing");
    expect(startupLegacyKind("acme", "other-co")).toBe("canonical");
  });

  it("301s Navier AI when both URLs are that company", () => {
    expect(startupLegacyKind("navier-ai", "navier-ai")).toBe("redirect");
    expect(investigationStartupShouldRewrite("navier-ai")).toBe(true);
    expect(startupLegacyKind("navier-ai", null)).toBe("missing");
    expect(startupLegacyKind("navier-ai", "other-co")).toBe("canonical");
    expect(buildInvestigationStartupPath("navier-ai")).toBe(
      "/investigations/startups/navier-ai",
    );
  });

  it("canonicalizes a slug whose /startups page is a different entity", () => {
    expect(startupsPathRendersProfile("ai-tools-list")).toBe(false);
    expect(startupLegacyKind("ai-tools-list", "ai-tools-list")).toBe(
      "canonical",
    );
    expect(investigationStartupShouldRewrite("ai-tools-list")).toBe(false);
    expect(AI_TOOLS_LIST_PATH).toBe("/startups/ai-tools-list");
  });

  it("keeps reserved startup paths off the company profile", () => {
    for (const slug of STARTUPS_RESERVED_SLUGS) {
      expect(startupsPathRendersProfile(slug)).toBe(false);
      expect(investigationStartupShouldRewrite(slug)).toBe(false);
    }
    expect(startupsPathRendersProfile("acme")).toBe(true);
    expect(startupsPathRendersProfile("navier-ai")).toBe(true);
  });

  it("accepts the same lowercase slugs as parseStartupSlug", () => {
    for (const value of ["acme", "navier-ai", "Acme", "not a slug", ""]) {
      const parsed = parseStartupSlug(value);
      expect(isStartupSlugShape(value)).toBe(parsed === value);
    }
    expect(isStartupSlugShape(parseStartupSlug("Acme")!)).toBe(true);
  });

  it("rewrites a same-entity profile, including Navier AI, and leaves the hub", () => {
    expect(
      investigationStartupRewriteTarget("/en/investigations/startups/acme"),
    ).toBe("/api/startup-profile-redirect/en/acme");
    expect(
      investigationStartupRewriteTarget("/fr/investigations/startups/Acme/"),
    ).toBe("/api/startup-profile-redirect/fr/acme");
    for (const locale of ["en", "nl", "fr"]) {
      expect(
        investigationStartupRewriteTarget(
          `/${locale}/investigations/startups/navier-ai`,
        ),
      ).toBe(`/api/startup-profile-redirect/${locale}/navier-ai`);
    }
    expect(
      investigationStartupRewriteTarget(
        "/nl/investigations/startups/ai-tools-list",
      ),
    ).toBeNull();
    expect(
      investigationStartupRewriteTarget("/en/investigations/startups"),
    ).toBeNull();
    expect(investigationStartupRewriteTarget("/en/startups/acme")).toBeNull();
    expect(
      investigationStartupRewriteTarget("/en/startups/navier-ai"),
    ).toBeNull();
  });

  it("omits investigation profile URLs, including Navier AI, from the sitemap", () => {
    expect(
      filterStartupSitemapPaths([
        "/startups/acme",
        "/startups/navier-ai",
        "/investigations/startups/navier-ai",
        "/investigations/startups/acme",
        "/investigations/startups/ai-tools-list",
        "/investigations/startups",
        "/investigations/startups/insights",
        "/investigations/startups/jobs",
        "/investigations/startups/jobs/role-1",
      ]),
    ).toEqual(["/startups/acme", "/startups/navier-ai"]);
  });
});
