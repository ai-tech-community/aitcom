import { describe, expect, it } from "vitest";

import { startupCountryOf } from "./startups-countries";

describe("startupCountryOf", () => {
  it("folds spellings of one country together", () => {
    expect(startupCountryOf("San Francisco, CA, USA")).toBe("United States");
    expect(startupCountryOf("Wamego, Kansas, United States")).toBe(
      "United States",
    );
    expect(startupCountryOf("Silicon Valley")).toBe("United States");
    expect(startupCountryOf("Austin, TX")).toBe("United States");
    expect(startupCountryOf("London")).toBe("United Kingdom");
    expect(startupCountryOf("Dubai, UAE")).toBe("United Arab Emirates");
  });

  it("reads the first place of a multi-place string", () => {
    expect(startupCountryOf("San Francisco, CA, USA; Remote")).toBe(
      "United States",
    );
  });

  it("keeps a sourced country it has no alias for, as written", () => {
    expect(startupCountryOf("Israel")).toBe("Israel");
    expect(startupCountryOf("Kefar Malal, Central District, Israel")).toBe(
      "Israel",
    );
    expect(startupCountryOf("Tbilisi, Georgia")).toBe("Georgia");
  });

  it("never guesses a country from an ambiguous code", () => {
    // IL is Illinois and Israel; CA is California and Canada.
    expect(startupCountryOf("Tel Aviv, IL")).toBeNull();
    expect(startupCountryOf("Chicago, IL")).toBeNull();
    expect(startupCountryOf("Toronto, CA")).toBeNull();
    expect(startupCountryOf("Somewhere, ZZ")).toBeNull();
  });

  it("returns null for places that are not one country", () => {
    expect(startupCountryOf("Remote")).toBeNull();
    expect(startupCountryOf("Middle East")).toBeNull();
    expect(startupCountryOf("")).toBeNull();
    expect(startupCountryOf(null)).toBeNull();
  });
});
