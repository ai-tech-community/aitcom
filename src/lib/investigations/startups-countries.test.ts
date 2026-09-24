import { describe, expect, it } from "vitest";

import {
  STARTUP_COUNTRY_CODES,
  classifyStartupPlace,
  isStartupCountryCode,
  startupCountryLabel,
} from "./startups-countries";

function codeOf(region: string | null) {
  const place = classifyStartupPlace(region);
  return place.kind === "country" ? place.code : place.kind;
}

describe("classifyStartupPlace", () => {
  it("folds spellings of one country together", () => {
    expect(codeOf("San Francisco, CA, USA")).toBe("US");
    expect(codeOf("Wamego, Kansas, United States")).toBe("US");
    expect(codeOf("Silicon Valley")).toBe("US");
    expect(codeOf("Austin, TX")).toBe("US");
    expect(codeOf("London")).toBe("GB");
    expect(codeOf("London, England, United Kingdom")).toBe("GB");
    expect(codeOf("Dubai, UAE")).toBe("AE");
    expect(codeOf("Istanbul, Turkey")).toBe("TR");
    expect(codeOf("Luxemburg")).toBe("LU");
  });

  it("reads a sourced country name, with or without a city before it", () => {
    expect(codeOf("Israel")).toBe("IL");
    expect(codeOf("Kefar Malal, Central District, Israel")).toBe("IL");
    expect(codeOf("Tbilisi, Georgia")).toBe("GE");
    expect(codeOf("Zürich, ZH, Switzerland")).toBe("CH");
    expect(codeOf("Hong Kong, Hong Kong")).toBe("HK");
  });

  it("reads the first place of a multi-place string", () => {
    expect(codeOf("San Francisco, CA, USA; Remote")).toBe("US");
    expect(codeOf("Singapore, Singapore; Jakarta, Jakarta, Indonesia")).toBe(
      "SG",
    );
  });

  it("places a bare city through the shared place list", () => {
    expect(codeOf("Berlin")).toBe("DE");
    expect(codeOf("berlin")).toBe("DE");
    expect(codeOf("Amsterdam")).toBe("NL");
    expect(codeOf("Munich")).toBe("DE");
    expect(codeOf("Frankfurt am Main")).toBe("DE");
  });

  it("resolves an ambiguous state code only through a known city", () => {
    // IL is Illinois and Israel; CA is California and Canada.
    expect(codeOf("Tel Aviv, IL")).toBe("IL");
    expect(codeOf("Chicago, IL")).toBe("US");
    expect(codeOf("Toronto, CA")).toBe("CA");
    expect(codeOf("Springfield, IL")).toBe("unknown");
  });

  it("never turns a city it does not know into a country", () => {
    expect(classifyStartupPlace("Hamburg")).toEqual({
      kind: "unknown",
      query: "Hamburg",
    });
    expect(classifyStartupPlace("Cologne, Nordrhein-Westfalen")).toEqual({
      kind: "unknown",
      query: "Cologne, Nordrhein-Westfalen",
    });
    expect(codeOf("Somewhere, ZZ")).toBe("unknown");
  });

  it("ignores an empty trailing comma part", () => {
    expect(classifyStartupPlace("The Hague,")).toEqual({
      kind: "unknown",
      query: "The Hague",
    });
    expect(codeOf("Berlin, Germany,")).toBe("DE");
  });

  it("marks places that are not one country as none, not unknown", () => {
    expect(codeOf("Remote")).toBe("none");
    expect(codeOf("Middle East")).toBe("none");
    expect(codeOf("Europe")).toBe("none");
    expect(codeOf("")).toBe("none");
    expect(codeOf(null)).toBe("none");
  });
});

describe("startup country codes", () => {
  it("accepts assigned ISO codes only", () => {
    expect(isStartupCountryCode("DE")).toBe(true);
    expect(isStartupCountryCode("XK")).toBe(true);
    expect(isStartupCountryCode("de")).toBe(false);
    expect(isStartupCountryCode("EU")).toBe(false);
    expect(isStartupCountryCode("ZZ")).toBe(false);
    expect(isStartupCountryCode(null)).toBe(false);
  });

  it("names every code in both page languages", () => {
    for (const code of STARTUP_COUNTRY_CODES) {
      expect(startupCountryLabel(code, "en")).not.toBe(code);
      expect(startupCountryLabel(code, "nl")).not.toBe(code);
    }
    expect(startupCountryLabel("US", "en")).toBe("United States");
    expect(startupCountryLabel("US", "nl")).toBe("Verenigde Staten");
    expect(startupCountryLabel("DE", "nl")).toBe("Duitsland");
  });
});
