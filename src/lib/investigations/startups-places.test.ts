import { describe, expect, it } from "vitest";

import {
  isStreetLikeStartupPlace,
  sourcedStartupPlaceLabel,
  startupPlaceCentroid,
} from "./startups-places";

describe("startup place centroids", () => {
  it("maps sourced city/region strings to centroids and never a street", () => {
    expect(startupPlaceCentroid("Toronto, Canada")).toEqual({
      lat: 43.6532,
      lng: -79.3832,
      kind: "city",
    });
    expect(startupPlaceCentroid("New York, US")).toEqual({
      lat: 40.7128,
      lng: -74.006,
      kind: "city",
    });
    expect(startupPlaceCentroid("California")).toMatchObject({
      kind: "region",
    });
    expect(startupPlaceCentroid(null)).toBeNull();
    expect(startupPlaceCentroid("")).toBeNull();
    expect(startupPlaceCentroid("Atlantis")).toBeNull();
    expect(startupPlaceCentroid("Remote")).toBeNull();
  });

  it("pins every sourced live-style region at a city or country centroid", () => {
    const liveRegions = [
      "Israel",
      "San Francisco, CA, USA",
      "Paris, Île-de-France, France",
      "New York City, NY, USA",
      "Bengaluru, KA, India",
      "Frankfurt am Main, Hesse, Germany",
      "Boston, MA, USA",
      "London, England, United Kingdom",
      "Dallas, Texas, United States",
      "Limerick, County Limerick, Ireland; Remote",
      "Los Angeles, CA, USA",
      "Seattle, WA, USA",
    ];
    for (const region of liveRegions) {
      expect(startupPlaceCentroid(region), region).not.toBeNull();
    }
    expect(startupPlaceCentroid("Israel")).toMatchObject({
      lat: 31.0461,
      lng: 34.8516,
      kind: "region",
    });
    expect(startupPlaceCentroid("San Francisco, CA, USA")).toMatchObject({
      lat: 37.7749,
      lng: -122.4194,
      kind: "city",
    });
    expect(startupPlaceCentroid("Paris, Île-de-France, France")).toMatchObject({
      lat: 48.8566,
      lng: 2.3522,
      kind: "city",
    });
  });

  it("refuses street-like strings so we never invent an address", () => {
    expect(isStreetLikeStartupPlace("123 Main Street, Toronto")).toBe(true);
    expect(isStreetLikeStartupPlace("Toronto, Canada")).toBe(false);
    expect(startupPlaceCentroid("500 Howard St, San Francisco")).toBeNull();
    expect(sourcedStartupPlaceLabel("123 Main Street, Toronto")).toBeNull();
    expect(sourcedStartupPlaceLabel("Toronto, Canada")).toBe("Toronto, Canada");
  });
});
