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
      expect(typeof m.nav.startups).toBe("string");
      expect((m.nav.startups ?? "").trim().length).toBeGreaterThan(0);
    }
    expect(en.nav.startups).toBe("Startups");
    expect(nl.nav.startups).toBe("Startups");
  });
});
