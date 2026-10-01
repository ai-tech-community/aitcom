import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { ipOriginFromHeaders } from "./visitor-location";

describe("ipOriginFromHeaders", () => {
  it("reads Vercel's estimate and decodes the city", () => {
    const h = new Headers({
      "x-vercel-ip-latitude": "52.0907",
      "x-vercel-ip-longitude": "5.1214",
      "x-vercel-ip-city": "Den%20Haag",
    });
    expect(ipOriginFromHeaders(h)).toEqual({
      point: { lat: 52.0907, lng: 5.1214 },
      city: "Den Haag",
    });
  });

  it("knows nothing off Vercel or with nonsense values", () => {
    expect(ipOriginFromHeaders(new Headers())).toBeNull();
    expect(
      ipOriginFromHeaders(
        new Headers({
          "x-vercel-ip-latitude": "999",
          "x-vercel-ip-longitude": "5",
        }),
      ),
    ).toBeNull();
  });

  it("keeps a position without a city", () => {
    expect(
      ipOriginFromHeaders(
        new Headers({
          "x-vercel-ip-latitude": "52",
          "x-vercel-ip-longitude": "5",
        }),
      ),
    ).toEqual({ point: { lat: 52, lng: 5 }, city: null });
  });
});
