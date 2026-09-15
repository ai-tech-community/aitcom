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
  });

  it("refuses street-like strings so we never invent an address", () => {
    expect(isStreetLikeStartupPlace("123 Main Street, Toronto")).toBe(true);
    expect(isStreetLikeStartupPlace("Toronto, Canada")).toBe(false);
    expect(startupPlaceCentroid("500 Howard St, San Francisco")).toBeNull();
    expect(sourcedStartupPlaceLabel("123 Main Street, Toronto")).toBeNull();
    expect(sourcedStartupPlaceLabel("Toronto, Canada")).toBe("Toronto, Canada");
  });
});
