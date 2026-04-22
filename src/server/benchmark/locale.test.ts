import { describe, expect, it } from "vitest";
import { parseCountry } from "./locale";

describe("parseCountry", () => {
  it("extracts country from en-US-style locale", () => {
    expect(parseCountry("en-US")).toBe("US");
    expect(parseCountry("fr-FR")).toBe("FR");
    expect(parseCountry("pt-BR")).toBe("BR");
  });

  it("uppercases lowercased country segments", () => {
    expect(parseCountry("en-gb")).toBe("GB");
  });

  it("handles language-only locales", () => {
    expect(parseCountry("en")).toBeNull();
    expect(parseCountry("fr")).toBeNull();
  });

  it("handles bogus / empty input", () => {
    expect(parseCountry("")).toBeNull();
    expect(parseCountry("xxxxx")).toBeNull();
    expect(parseCountry(null as never)).toBeNull();
    expect(parseCountry(undefined as never)).toBeNull();
  });

  it("accepts underscore separator", () => {
    expect(parseCountry("en_US")).toBe("US");
  });
});
