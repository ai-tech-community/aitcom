import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import {
  DATACENTER_TABS,
  datacenterTabPath,
  isReservedDatacenterSlug,
} from "./datacenter-investigation-routes";

const DATACENTERS_ROUTE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../app/[locale]/investigations/datacenters",
);

/** Static child segments, looking through route groups like `(dashboard)`. */
function staticChildSegments(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("["))
    .flatMap((e) =>
      e.name.startsWith("(")
        ? staticChildSegments(join(dir, e.name))
        : [e.name],
    );
}

describe("datacenter investigation routes", () => {
  it("has a page for every tab", () => {
    const segments = staticChildSegments(DATACENTERS_ROUTE);
    for (const tab of DATACENTER_TABS.filter((t) => t.segment)) {
      expect(segments).toContain(tab.segment);
    }
  });

  it("reserves every static child route so no facility slug is shadowed", () => {
    for (const segment of staticChildSegments(DATACENTERS_ROUTE)) {
      expect(isReservedDatacenterSlug(segment), segment).toBe(true);
    }
    expect(isReservedDatacenterSlug("microsoft-fairwater")).toBe(false);
  });

  it("keeps Facilities at the investigation root so filter links land on the table", () => {
    expect(datacenterTabPath(DATACENTER_TABS[0].segment)).toBe(
      "/investigations/datacenters",
    );
    expect(datacenterTabPath("red-flags")).toBe(
      "/investigations/datacenters/red-flags",
    );
  });

  it("labels every tab in English and Dutch", () => {
    for (const tab of DATACENTER_TABS) {
      expect(en.datacenterInvestigation.tabs[tab.key]).toBeTruthy();
      expect(nl.datacenterInvestigation.tabs[tab.key]).toBeTruthy();
    }
  });
});
