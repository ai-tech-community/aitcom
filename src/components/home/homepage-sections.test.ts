import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

const dir = dirname(fileURLToPath(import.meta.url));
const homepage = readFileSync(join(dir, "../../app/[locale]/page.tsx"), "utf8");

/** Every .tsx under src/components/home, tests excluded. */
function homeComponents(root = dir): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return homeComponents(path);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [path] : [];
  });
}

describe("homepage sections", () => {
  it("runs hero → communities → events → start → what we do → proof → sponsors → closing square", () => {
    const order = [
      "<HomeHeroPlaza",
      "<FeaturedCommunities",
      "<UpcomingEvents",
      "<HomeCrawlDoors",
      "<WhatWeDo",
      "<RecentGatherings",
      "<HomeSponsors",
      "<HomeClosingSquare",
    ].map((tag) => {
      const at = homepage.indexOf(tag);
      expect(at, tag).toBeGreaterThan(-1);
      return at;
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("has no closing CTA cards and no slogan section", () => {
    expect(homepage).not.toMatch(/t\(["'`]join\./);
    expect(homepage).not.toMatch(/aiHumans|sponsorPitch/);
    expect(homepage).not.toContain("CTA Cards");
  });

  it("never links to a placeholder #", () => {
    for (const source of [
      homepage,
      ...homeComponents().map((p) => readFileSync(p, "utf8")),
    ]) {
      expect(source).not.toMatch(/href=["']#["']|\?\?\s*["']#["']/);
    }
  });

  it("uses the shared section label and no external-link arrows", () => {
    expect(homepage).not.toMatch(/function SectionLabel/);
    for (const path of homeComponents()) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/function SectionLabel/);
      expect(source, path).not.toContain("ArrowUpRight");
    }
    expect(homepage).not.toContain("ArrowUpRight");
  });

  it("translates the stat labels instead of hard-coding English", () => {
    expect(homepage).not.toMatch(/label="[A-Z]+"/);
    expect(homepage).toContain('getTranslations("homeStats")');
    // The count is public roster profiles, and the label says so.
    expect(homepage).toContain('stats("profiles")');
    expect(en.homeStats.profiles).toBe("Public profiles");
    expect(nl.homeStats.profiles).toBe("Openbare profielen");
  });
});

describe("homepage messages", () => {
  const keys = (o: unknown, prefix = ""): string[] =>
    o && typeof o === "object"
      ? Object.entries(o).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
      : [prefix];

  it.each(["homeStats", "homeRecent", "homeSponsors", "homeClosing"] as const)(
    "%s has the same, non-empty keys in EN and NL",
    (ns) => {
      expect(keys(nl[ns]).sort()).toEqual(keys(en[ns]).sort());
      for (const m of [en[ns], nl[ns]]) {
        for (const value of Object.values(m)) {
          expect(String(value).trim()).not.toBe("");
        }
      }
    },
  );

  it("drops the messages of the removed sections", () => {
    for (const m of [en, nl] as Record<string, unknown>[]) {
      expect(m).not.toHaveProperty("aiHumans");
      expect(m).not.toHaveProperty("sponsorPitch");
      expect(m).not.toHaveProperty("join");
    }
  });
});
