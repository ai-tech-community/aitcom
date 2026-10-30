import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { routing } from "@/i18n/routing";

import { PERMANENT_REDIRECT_STATUS, siteRedirects } from "./site-redirects.js";

const { getRedirectStatus } = createRequire(import.meta.url)(
  "next/dist/lib/redirect-status.js",
) as {
  getRedirectStatus: (route: {
    permanent?: boolean;
    statusCode?: number;
  }) => number;
};

type Redirect = (typeof siteRedirects)[number];

function matchSource(
  source: string,
  pathname: string,
): Record<string, string> | null {
  const pattern = source
    .split("/")
    .map((segment) => {
      if (segment === "") return "";
      const star = /^:([A-Za-z0-9_]+)\*$/.exec(segment);
      if (star) return `(?<${star[1]}>.*)`;
      const custom = /^:([A-Za-z0-9_]+)\(([^)]+)\)$/.exec(segment);
      if (custom) return `(?<${custom[1]}>${custom[2]})`;
      const named = /^:([A-Za-z0-9_]+)$/.exec(segment);
      if (named) return `(?<${named[1]}>[^/]+)`;
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  const match = new RegExp(`^${pattern}$`).exec(pathname);
  return match?.groups ?? null;
}

function fillDestination(
  destination: string,
  groups: Record<string, string>,
): string {
  return destination.replace(/:([A-Za-z0-9_]+)\*?/g, (_, name: string) => {
    const value = groups[name];
    if (value == null) throw new Error(`missing :${name} in ${destination}`);
    return value;
  });
}

/** First matching rule, the same order next.config.js returns them. */
function resolveRedirect(pathname: string): {
  destination: string;
  status: number;
} | null {
  for (const rule of siteRedirects) {
    const groups = matchSource(rule.source, pathname);
    if (!groups) continue;
    return {
      destination: fillDestination(rule.destination, groups),
      status: rule.permanent ? PERMANENT_REDIRECT_STATUS : 307,
    };
  }
  return null;
}

const localeGroup = routing.locales.join("|");

describe("retired section redirects", () => {
  it("uses HTTP 308 for every permanent rule", () => {
    expect(getRedirectStatus({ permanent: true })).toBe(308);
    expect(PERMANENT_REDIRECT_STATUS).toBe(308);
    for (const rule of siteRedirects) {
      expect(rule.permanent).toBe(true);
      expect(getRedirectStatus(rule)).toBe(308);
      expect(resolveRedirect(samplePath(rule))?.status).toBe(308);
    }
  });

  it("covers every configured locale and collapses subpaths", () => {
    expect(localeGroup).toBe("en|nl|fr");
    for (const rule of siteRedirects) {
      expect(rule.source).toContain(`:locale(${localeGroup})`);
    }

    for (const locale of routing.locales) {
      expect(resolveRedirect(`/${locale}/benchmark`)).toEqual({
        destination: `/${locale}/agents`,
        status: 308,
      });
      expect(resolveRedirect(`/${locale}/benchmark/brands/acme`)).toEqual({
        destination: `/${locale}/agents`,
        status: 308,
      });
      expect(resolveRedirect(`/${locale}/benchmark/`)).toEqual({
        destination: `/${locale}/agents`,
        status: 308,
      });
      expect(resolveRedirect(`/${locale}/challenges`)).toEqual({
        destination: `/${locale}/communities`,
        status: 308,
      });
      expect(resolveRedirect(`/${locale}/challenges/rag-hack/brief`)).toEqual({
        destination: `/${locale}/communities`,
        status: 308,
      });
      expect(resolveRedirect(`/${locale}/impact`)).toEqual({
        destination: `/${locale}`,
        status: 308,
      });
      expect(resolveRedirect(`/${locale}/impact/report`)).toEqual({
        destination: `/${locale}`,
        status: 308,
      });
    }
  });

  it("leaves unrelated paths alone", () => {
    expect(resolveRedirect("/en/agents")).toBeNull();
    expect(resolveRedirect("/en/communities")).toBeNull();
    expect(resolveRedirect("/nl")).toBeNull();
    expect(resolveRedirect("/en/benchmarks")).toBeNull();
    expect(resolveRedirect("/api/benchmark")).toBeNull();
    expect(resolveRedirect("/api/cron/impact-aggregation")).toBeNull();
    expect(resolveRedirect("/benchmark")).toBeNull();
    expect(resolveRedirect("/en/events/impact-night")).toBeNull();
  });

  it("keeps the investigations/startups redirects, including jobs", () => {
    expect(resolveRedirect("/en/investigations/startups")).toEqual({
      destination: "/en/startups",
      status: 308,
    });
    expect(resolveRedirect("/nl/investigations/startups/acme")).toEqual({
      destination: "/nl/startups/acme",
      status: 308,
    });
    expect(resolveRedirect("/en/investigations/startups/insights")).toEqual({
      destination: "/en/startups/insights",
      status: 308,
    });
    expect(resolveRedirect("/en/investigations/startups/jobs")).toEqual({
      destination: "/en/jobs",
      status: 308,
    });
    expect(resolveRedirect("/nl/investigations/startups/jobs/role-1")).toEqual({
      destination: "/nl/jobs/role-1",
      status: 308,
    });
    expect(resolveRedirect("/en/startups/jobs")).toEqual({
      destination: "/en/jobs",
      status: 308,
    });
    expect(resolveRedirect("/en/communities/makers/jobs")).toEqual({
      destination: "/en/jobs",
      status: 308,
    });
  });

  it("is what next.config.js returns after the apex host redirect", () => {
    const nextConfig = readFileSync(
      join(process.cwd(), "next.config.js"),
      "utf8",
    );
    expect(nextConfig).toContain("...siteRedirects");
    expect(nextConfig).toContain('value: "aitcommunity.org"');
    expect(nextConfig).toContain("https://www.aitcommunity.org/:path*");
    expect(nextConfig).not.toContain("/investigations/startups/:path*");
  });
});

function samplePath(rule: Redirect): string {
  return rule.source
    .replace(`:locale(${localeGroup})`, routing.defaultLocale)
    .replace(":slug", "makers")
    .replace("/:path*", "/sample");
}
