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
      expect(keyPaths(nl[ns]).sort()).toEqual(keyPaths(en[ns]).sort());
    },
  );

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
