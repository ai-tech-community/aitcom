import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

describe("nav.explore i18n", () => {
  it("exists and is non-empty in every locale", () => {
    for (const m of [en, nl] as Array<{
      nav: Record<string, string | undefined>;
    }>) {
      const label = m.nav.explore;
      expect(typeof label).toBe("string");
      expect((label ?? "").trim().length).toBeGreaterThan(0);
    }
  });
});
