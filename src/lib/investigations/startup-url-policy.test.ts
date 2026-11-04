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
  isStartupCanonicalHoldout,
  isStartupSlugShape,
  startupHoldoutInvestigationPaths,
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

  it("canonicalizes a slug whose /startups page is a different entity", () => {
    expect(startupsPathRendersProfile("ai-tools-list")).toBe(false);
    expect(startupLegacyKind("ai-tools-list", "ai-tools-list")).toBe(
      "canonical",
    );
    expect(investigationStartupShouldRewrite("ai-tools-list")).toBe(false);
    expect(AI_TOOLS_LIST_PATH).toBe("/startups/ai-tools-list");
  });

  it("leaves Navier AI with no canonical and no redirect", () => {
    expect(isStartupCanonicalHoldout("navier-ai")).toBe(true);
    expect(startupLegacyKind("navier-ai", "navier-ai")).toBe("holdout");
    expect(investigationStartupShouldRewrite("navier-ai")).toBe(false);
    expect(startupLegacyKind("navier-ai", null)).toBe("missing");
    expect(buildInvestigationStartupPath("navier-ai")).toBe(
      "/investigations/startups/navier-ai",
    );
  });

  it("keeps reserved startup paths off the company profile", () => {
    for (const slug of STARTUPS_RESERVED_SLUGS) {
      expect(startupsPathRendersProfile(slug)).toBe(false);
      expect(investigationStartupShouldRewrite(slug)).toBe(false);
    }
    expect(startupsPathRendersProfile("acme")).toBe(true);
  });

  it("accepts the same lowercase slugs as parseStartupSlug", () => {
    for (const value of ["acme", "navier-ai", "Acme", "not a slug", ""]) {
      const parsed = parseStartupSlug(value);
      expect(isStartupSlugShape(value)).toBe(parsed === value);
    }
    expect(isStartupSlugShape(parseStartupSlug("Acme")!)).toBe(true);
  });

  it("rewrites a same-entity profile and leaves the holdout and the hub", () => {
    expect(
      investigationStartupRewriteTarget("/en/investigations/startups/acme"),
    ).toBe("/api/startup-profile-redirect/en/acme");
    expect(
      investigationStartupRewriteTarget("/fr/investigations/startups/Acme/"),
    ).toBe("/api/startup-profile-redirect/fr/acme");
    expect(
      investigationStartupRewriteTarget(
        "/en/investigations/startups/navier-ai",
      ),
    ).toBeNull();
    expect(
      investigationStartupRewriteTarget(
        "/nl/investigations/startups/ai-tools-list",
      ),
    ).toBeNull();
    expect(
      investigationStartupRewriteTarget("/en/investigations/startups"),
    ).toBeNull();
    expect(investigationStartupRewriteTarget("/en/startups/acme")).toBeNull();
  });

  it("lists only the Navier AI investigations URL in the sitemap", () => {
    expect(
      startupHoldoutInvestigationPaths(["navier-ai", "acme", "navier-ai"]),
    ).toEqual(["/investigations/startups/navier-ai"]);
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
    ).toEqual([
      "/startups/acme",
      "/startups/navier-ai",
      "/investigations/startups/navier-ai",
    ]);
  });
});
