import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

describe("nav.explore i18n", () => {
  it("exists and is non-empty in every locale", () => {
    for (const m of [en, nl] as Array<{ nav: Record<string, string> }>) {
      expect(typeof m.nav.explore).toBe("string");
      expect(m.nav.explore.trim().length).toBeGreaterThan(0);
    }
  });
});
