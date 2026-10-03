import { describe, expect, it } from "vitest";

import { FAILURE_CODES } from "@/server/collectors/errors";
import { STOP_REASONS } from "@/server/collectors/run-status";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("collectors copy", () => {
  it.each(["collectors", "collectorsAbout"] as const)(
    "%s has the same keys in English and Dutch",
    (ns) => {
      expect(en[ns]).toBeDefined();
      expect(nl[ns]).toBeDefined();
      expect(keyPaths(nl[ns]).sort()).toEqual(keyPaths(en[ns]).sort());
    },
  );

  it.each(["stop", "status", "failure"] as const)(
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
    const english: Record<string, string> = en.collectors.stop;
    const dutch: Record<string, string> = nl.collectors.stop;
    for (const reason of STOP_REASONS) {
      expect(english[reason], reason).toBeTruthy();
      expect(dutch[reason], reason).toBeTruthy();
    }
    expect(Object.keys(english).sort()).toEqual([...STOP_REASONS].sort());
  });

  it("words every failure detail code", () => {
    const english: Record<string, string> = en.collectors.failure;
    const dutch: Record<string, string> = nl.collectors.failure;
    for (const code of FAILURE_CODES) {
      expect(english[code], code).toBeTruthy();
      expect(dutch[code], code).toBeTruthy();
    }
    expect(Object.keys(english).sort()).toEqual([...FAILURE_CODES].sort());
  });

  it.each([
    "page_too_slow",
    "page_too_deep",
    "page_too_complex",
    "selector_not_allowed",
    "not_a_page",
  ])("words the %s failure in everyday words", (code) => {
    const english: Record<string, string> = en.collectors.failure;
    const dutch: Record<string, string> = nl.collectors.failure;
    for (const text of [english[code], dutch[code]]) {
      expect(text, code).toBeTruthy();
      expect(text, code).not.toMatch(/\bDOM\b|pars|engine|worker|sandbox/i);
    }
  });

  it("puts the feed's answer in the feed_status sentence", () => {
    expect(en.collectors.failure.feed_status).toContain("{status}");
    expect(nl.collectors.failure.feed_status).toContain("{status}");
  });
});
