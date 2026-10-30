import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const publishDatacenterFacility = vi.hoisted(() => vi.fn());

vi.mock("@/server/datacenters/publish-facility", () => ({
  publishDatacenterFacility,
}));

import { POST } from "./route";

const URL =
  "https://www.aitcommunity.org/en/investigations/datacenters/fairwater";

function req(body: unknown, auth?: string) {
  return new Request(
    "https://www.aitcommunity.org/api/investigations/datacenters",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
  publishDatacenterFacility.mockResolvedValue({
    ok: true,
    inserted: true,
    slug: "fairwater",
    path: "/investigations/datacenters/fairwater",
    url: URL,
    sourceUrl: "https://example.com/filing",
    checkedAt: "2026-10-28T00:00:00.000Z",
    updatedAt: "2026-10-30T15:04:00.000Z",
    status: "operational",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/investigations/datacenters", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await POST(req({}))).status).toBe(401);
    expect((await POST(req({}, "Bearer nope"))).status).toBe(401);
    expect(publishDatacenterFacility).not.toHaveBeenCalled();
  });

  it("stores a facility for the bearer caller", async () => {
    const body = {
      name: "Fairwater",
      operator: "Microsoft",
      source_url: "https://example.com/filing",
      checked_at: "2026-10-28T00:00:00.000Z",
    };
    const res = await POST(req(body, "Bearer s3cret"));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ inserted: true, url: URL });
    expect(publishDatacenterFacility).toHaveBeenCalledWith(body);
  });

  it("returns the existing facility when the slug or name was already stored", async () => {
    publishDatacenterFacility.mockResolvedValue({
      ok: true,
      inserted: false,
      url: URL,
    });
    const res = await POST(req({}, "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inserted: false, url: URL });
  });

  it("rejects a facility with no https source", async () => {
    publishDatacenterFacility.mockResolvedValue({
      ok: false,
      error: "source_url must be an https URL.",
    });
    const res = await POST(req({}, "Bearer s3cret"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "source_url must be an https URL.",
    });
  });
});
