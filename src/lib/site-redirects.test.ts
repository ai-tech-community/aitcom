import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { routing } from "@/i18n/routing";

import {
  PERMANENT_REDIRECT_STATUS,
  siteRedirects,
  trailingSlashRedirect,
} from "./site-redirects.js";

const { getRedirectStatus, modifyRouteRegex } = createRequire(import.meta.url)(
  "next/dist/lib/redirect-status.js",
) as {
  getRedirectStatus: (route: {
    permanent?: boolean;
    statusCode?: number;
  }) => number;
  modifyRouteRegex: (regex: string, restrictedPaths?: string[]) => string;
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
      const plus = /^:([A-Za-z0-9_]+)\+$/.exec(segment);
      if (plus) return `(?<${plus[1]}>.+)`;
      const custom = /^:([A-Za-z0-9_]+)\(([^)]+)\)$/.exec(segment);
      if (custom) return `(?<${custom[1]}>${custom[2]})`;
      const named = /^:([A-Za-z0-9_]+)$/.exec(segment);
      if (named) return `(?<${named[1]}>[^/]+)`;
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  // Next's modifyRouteRegex makes the trailing slash optional on user rules.
  const match = new RegExp(modifyRouteRegex(`^${pattern}$`)).exec(pathname);
  return match?.groups ?? null;
}

function fillDestination(
  destination: string,
  groups: Record<string, string>,
): string {
  return destination.replace(
    /:([A-Za-z0-9_]+)(?:\*|\+)?/g,
    (_, name: string) => {
      const value = groups[name];
      if (value == null) throw new Error(`missing :${name} in ${destination}`);
      return value;
    },
  );
}

type ListedRedirect = Redirect | typeof trailingSlashRedirect;

/** First matching rule, the same order next.config.js returns them. */
function resolveRedirect(
  pathname: string,
  rules: readonly ListedRedirect[] = siteRedirects,
): {
  destination: string;
  status: number;
} | null {
  for (const rule of rules) {
    const groups = matchSource(rule.source, pathname);
    if (!groups) continue;
    return {
      destination: fillDestination(rule.destination, groups),
      status: getRedirectStatus(rule),
    };
  }
  return null;
}

/** Site rules, then the slash strip that next.config.js appends. */
function resolveConfiguredRedirect(pathname: string) {
  return resolveRedirect(pathname, [...siteRedirects, trailingSlashRedirect]);
}

const localeGroup = routing.locales.join("|");

describe("retired section redirects", () => {
  it("uses HTTP 308 for permanent rules and 301 where a rule sets statusCode", () => {
    expect(getRedirectStatus({ permanent: true })).toBe(308);
    expect(PERMANENT_REDIRECT_STATUS).toBe(308);
    expect(getRedirectStatus({ statusCode: 301 })).toBe(301);
    for (const rule of siteRedirects) {
      const status = getRedirectStatus(rule);
      if ("statusCode" in rule && rule.statusCode === 301) {
        expect("permanent" in rule).toBe(false);
        expect(status).toBe(301);
      } else {
        expect(rule.permanent).toBe(true);
        expect(status).toBe(308);
      }
      expect(resolveRedirect(samplePath(rule))?.status).toBe(status);
    }
    expect(getRedirectStatus(trailingSlashRedirect)).toBe(308);
  });

  it("301s /tools and /tools/ to the AI tools directory in every locale", () => {
    const toolsRules = siteRedirects.filter((rule) =>
      rule.source.endsWith("/tools"),
    );
    expect(toolsRules).toEqual([
      {
        source: `/:locale(${localeGroup})/tools`,
        destination: "/:locale/startups/ai-tools-list",
        statusCode: 301,
      },
    ]);
    for (const rule of toolsRules) {
      expect(getRedirectStatus(rule)).toBe(301);
    }
    expect(
      existsSync(
        join(process.cwd(), "src/app/[locale]/startups/ai-tools-list/page.tsx"),
      ),
    ).toBe(true);

    for (const locale of routing.locales) {
      for (const pathname of [`/${locale}/tools`, `/${locale}/tools/`]) {
        expect(resolveRedirect(pathname)).toEqual({
          destination: `/${locale}/startups/ai-tools-list`,
          status: 301,
        });
        expect(resolveConfiguredRedirect(pathname)).toEqual({
          destination: `/${locale}/startups/ai-tools-list`,
          status: 301,
        });
      }
      expect(resolveConfiguredRedirect(`/${locale}/tools/extra`)).toBeNull();
      expect(resolveConfiguredRedirect(`/${locale}/tools/extra/`)).toEqual({
        destination: `/${locale}/tools/extra`,
        status: 308,
      });
      expect(resolveRedirect(`/${locale}/startups/ai-tools-list`)).toBeNull();
    }

    expect(resolveRedirect("/tools")).toBeNull();
    expect(resolveRedirect("/tools/")).toBeNull();
    expect(resolveConfiguredRedirect("/en/agents/")).toEqual({
      destination: "/en/agents",
      status: 308,
    });
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

  it("301s the startup directory, Insights, and Jobs when they are the same page", () => {
    expect(resolveRedirect("/en/investigations/startups")).toEqual({
      destination: "/en/startups",
      status: 301,
    });
    expect(resolveRedirect("/en/investigations/startups/insights")).toEqual({
      destination: "/en/startups/insights",
      status: 301,
    });
    expect(resolveRedirect("/fr/investigations/startups/insights")).toEqual({
      destination: "/fr/startups/insights",
      status: 301,
    });
    expect(resolveRedirect("/en/investigations/startups/jobs")).toEqual({
      destination: "/en/jobs",
      status: 301,
    });
    expect(resolveRedirect("/nl/investigations/startups/jobs/role-1")).toEqual({
      destination: "/nl/jobs/role-1",
      status: 301,
    });
    // Company profiles, including Navier AI, 301 in the node route.
    expect(resolveRedirect("/nl/investigations/startups/acme")).toBeNull();
    expect(resolveRedirect("/en/investigations/startups/navier-ai")).toBeNull();
    expect(resolveRedirect("/fr/investigations/startups/navier-ai")).toBeNull();
    expect(
      resolveRedirect("/en/investigations/startups/ai-tools-list"),
    ).toBeNull();
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
    expect(nextConfig).toContain("skipTrailingSlashRedirect: true");
    expect(nextConfig).toContain("...siteRedirects");
    const redirectsBlock = nextConfig.slice(
      nextConfig.indexOf("async redirects"),
    );
    const siteRedirectsAt = redirectsBlock.indexOf("...siteRedirects");
    const slashStripAt = redirectsBlock.indexOf("trailingSlashRedirect");
    expect(siteRedirectsAt).toBeGreaterThan(-1);
    expect(slashStripAt).toBeGreaterThan(siteRedirectsAt);
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
