import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

const STOP_REASONS = [
  "complete",
  "page_limit",
  "item_limit",
  "time_limit",
  "site_refused",
  "robots_disallowed",
  "robots_unreachable",
  "blocked_domain",
  "error",
  "worker_lost",
] as const;

describe("collectors copy", () => {
  it.each(["collectors", "collectorsAbout"] as const)(
    "%s has the same keys in English and Dutch",
    (ns) => {
      expect(en[ns]).toBeDefined();
      expect(nl[ns]).toBeDefined();
      expect(keyPaths(nl[ns]).sort()).toEqual(keyPaths(en[ns]).sort());
    },
  );

  it.each(["stop", "status"] as const)(
    "translates every collectors.%s value into Dutch",
    (group) => {
      const english: Record<string, string> = en.collectors[group];
      const dutch: Record<string, string> = nl.collectors[group];
      for (const [key, value] of Object.entries(english)) {
        expect(dutch[key], key).toBeTruthy();
        expect(dutch[key], key).not.toBe(value);
      }
    },
  );

  it("keeps file-name jargon out of member copy", () => {
    for (const catalog of [en, nl]) {
      expect(JSON.stringify(catalog.collectors)).not.toContain("robots.txt");
    }
  });

  it("has the dashboard tab label in both languages", () => {
    expect(en.dashboard.tabs.collectors).toBeTruthy();
    expect(nl.dashboard.tabs.collectors).toBeTruthy();
  });

  it("words every stop reason", () => {
    for (const reason of STOP_REASONS) {
      expect(en.collectors.stop[reason], reason).toBeTruthy();
      expect(nl.collectors.stop[reason], reason).toBeTruthy();
    }
  });
});
