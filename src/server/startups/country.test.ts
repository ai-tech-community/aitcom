import { beforeEach, describe, expect, it, vi } from "vitest";

const searchPlaces = vi.fn<(query: string) => Promise<unknown>>();
vi.mock("@/server/geocoding/nominatim", () => ({
  searchPlaces: (query: string) => searchPlaces(query),
}));

import {
  createStartupCountryResolver,
  geocodeStartupCountry,
  planStartupCountryBackfill,
  startupCountryForWrite,
} from "./country";

function place(
  countryCode: string | null,
  name: string,
  nameEn: string | null = null,
) {
  return { countryCode, name, nameEn };
}

beforeEach(() => {
  searchPlaces.mockReset();
});

describe("createStartupCountryResolver", () => {
  it("names a country from the local lists without geocoding", async () => {
    const geocode = vi.fn();
    const resolve = createStartupCountryResolver(geocode);
    expect(await resolve("Boston, Massachusetts, United States")).toBe("US");
    expect(await resolve("Berlin")).toBe("DE");
    expect(await resolve("Israel")).toBe("IL");
    expect(geocode).not.toHaveBeenCalled();
  });

  it("does not geocode a place that is not one country", async () => {
    const geocode = vi.fn();
    const resolve = createStartupCountryResolver(geocode);
    expect(await resolve("Remote")).toBeNull();
    expect(await resolve("Middle East")).toBeNull();
    expect(await resolve(null)).toBeNull();
    expect(geocode).not.toHaveBeenCalled();
  });

  it("geocodes an unknown place once, with the first sourced place", async () => {
    const geocode = vi.fn().mockResolvedValue("DE");
    const resolve = createStartupCountryResolver(geocode);
    expect(await resolve("Hamburg")).toBe("DE");
    expect(await resolve("hamburg; Remote")).toBe("DE");
    expect(await resolve("Hamburg")).toBe("DE");
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(geocode).toHaveBeenCalledWith("Hamburg");
  });

  it("leaves the country empty when the geocoder fails", async () => {
    const geocode = vi.fn().mockRejectedValue(new Error("down"));
    const resolve = createStartupCountryResolver(geocode);
    expect(await resolve("Hamburg")).toBeNull();
  });
});

describe("geocodeStartupCountry", () => {
  it("prefers the match named as written over a more important one", async () => {
    // Noordwijk is also Norwich's Dutch name; Norwich ranks first.
    searchPlaces.mockResolvedValue([
      place("GB", "Norwich"),
      place("NL", "Noordwijk"),
    ]);
    expect(await geocodeStartupCountry("Noordwijk")).toBe("NL");
    expect(searchPlaces).toHaveBeenCalledWith("Noordwijk");
  });

  it("matches the English name, without a leading The", async () => {
    searchPlaces.mockResolvedValue([
      place("NL", "Den Haag", "The Hague"),
      place("CA", "Hague"),
    ]);
    expect(await geocodeStartupCountry("Hague")).toBe("NL");
  });

  it("keeps the top match when its name begins with the text", async () => {
    searchPlaces.mockResolvedValue([
      place("DE", "Halle (Saale)"),
      place("BE", "Halle"),
    ]);
    expect(await geocodeStartupCountry("Halle")).toBe("DE");
    searchPlaces.mockResolvedValue([
      place("DE", "Esslingen am Neckar"),
      place("CH", "Esslingen"),
    ]);
    expect(await geocodeStartupCountry("Esslingen")).toBe("DE");
  });

  it("reads German spellings as the same name", async () => {
    searchPlaces.mockResolvedValue([
      place("DE", "Münster"),
      place("US", "Muenster", "Muenster"),
    ]);
    expect(await geocodeStartupCountry("Muenster")).toBe("DE");
  });

  it("takes the first match when no name is written the same way", async () => {
    searchPlaces.mockResolvedValue([
      place("DE", "Garching bei München"),
      place("AT", "Garching"),
    ]);
    expect(await geocodeStartupCountry("Garching Bei Munich")).toBe("DE");
  });

  it("drops a code outside the country list, or no match", async () => {
    searchPlaces.mockResolvedValue([place("EU", "Europa")]);
    expect(await geocodeStartupCountry("Europa")).toBeNull();
    searchPlaces.mockResolvedValue([place(null, "Nowhere")]);
    expect(await geocodeStartupCountry("Nowhere")).toBeNull();
    searchPlaces.mockResolvedValue([]);
    expect(await geocodeStartupCountry("Nowhere")).toBeNull();
  });
});

describe("startupCountryForWrite", () => {
  it("keeps the stored country when the region did not change", async () => {
    const resolve = vi.fn();
    expect(
      await startupCountryForWrite("Hamburg", resolve, {
        region: "Hamburg",
        country: "DE",
      }),
    ).toBe("DE");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("resolves again when the region changed or nothing was stored", async () => {
    const resolve = vi.fn().mockResolvedValue("FR");
    expect(
      await startupCountryForWrite("Paris", resolve, {
        region: "Hamburg",
        country: "DE",
      }),
    ).toBe("FR");
    expect(
      await startupCountryForWrite("Paris", resolve, {
        region: "Paris",
        country: null,
      }),
    ).toBe("FR");
    expect(await startupCountryForWrite("Paris", resolve)).toBe("FR");
    expect(resolve).toHaveBeenCalledTimes(3);
  });
});

describe("planStartupCountryBackfill", () => {
  it("resolves each distinct region once and groups its rows", async () => {
    const resolve = vi.fn(async (region: string | null | undefined) =>
      region === "Hamburg" ? ("DE" as const) : null,
    );
    const groups = await planStartupCountryBackfill(
      [
        { id: "a", region: "Hamburg", country: null },
        { id: "b", region: "Remote", country: null },
        { id: "c", region: "Hamburg", country: null },
      ],
      resolve,
    );
    expect(groups).toEqual([
      { region: "Hamburg", country: "DE", ids: ["a", "c"], stale: ["a", "c"] },
      { region: "Remote", country: null, ids: ["b"], stale: [] },
    ]);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("rewrites a wrong stored country but never clears one", async () => {
    const resolve = vi.fn(async (region: string | null | undefined) =>
      region === "Atlanta, Georgia" ? ("US" as const) : null,
    );
    const groups = await planStartupCountryBackfill(
      [
        { id: "a", region: "Atlanta, Georgia", country: "GE" },
        { id: "b", region: "Atlanta, Georgia", country: "US" },
        { id: "c", region: "Hamburg", country: "DE" },
      ],
      resolve,
    );
    expect(groups.map((group) => group.stale)).toEqual([["a"], []]);
  });
});
