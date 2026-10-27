import { beforeEach, describe, expect, it, vi } from "vitest";

const confirmEmailSubscription = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({}));
const payload = vi.hoisted(() => ({}));
const getPayloadClient = vi.hoisted(() => vi.fn(async () => payload));

vi.mock("@/server/db", () => ({ db }));
vi.mock("@/server/payload", () => ({ getPayloadClient }));
vi.mock("@/server/magazines/subscriptions/service", () => ({
  confirmEmailSubscription,
}));

import * as route from "./route";

function post(fields: Record<string, string>) {
  return new Request(
    "https://www.aitcommunity.org/api/magazine-subscriptions/confirm",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  confirmEmailSubscription.mockResolvedValue({
    status: "subscribed",
    magazine: null,
  });
});

describe("POST /api/magazine-subscriptions/confirm", () => {
  it("confirms on POST and sends the reader back to the page", async () => {
    const res = await route.POST(post({ t: "abc", locale: "nl" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://www.aitcommunity.org/nl/magazine-subscriptions/confirm?t=abc",
    );
    expect(confirmEmailSubscription).toHaveBeenCalledExactlyOnceWith(
      { db, payload },
      "abc",
      expect.any(Date),
    );
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("refuses a request without a link", async () => {
    const requests: Record<string, string>[] = [
      { locale: "en" },
      { t: "", locale: "en" },
    ];
    for (const fields of requests) {
      expect((await route.POST(post(fields))).status).toBe(400);
    }
    expect(confirmEmailSubscription).not.toHaveBeenCalled();
    expect(getPayloadClient).not.toHaveBeenCalled();
  });

  it("has no GET", () => {
    expect(route).not.toHaveProperty("GET");
  });

  it.each(["//evil.example", "de"])(
    "ignores a locale that is not ours (%s)",
    async (locale) => {
      const req = post({ t: "a+b&next=//evil.example", locale });
      const res = await route.POST(req);
      const location = new URL(res.headers.get("location")!);
      expect(res.status).toBe(303);
      expect(location.origin).toBe(new URL(req.url).origin);
      expect(location.pathname).toBe("/en/magazine-subscriptions/confirm");
      expect(location.searchParams.get("t")).toBe("a+b&next=//evil.example");
      expect([...location.searchParams.keys()]).toEqual(["t"]);
    },
  );

  it.each(["subscribed", "expired", "invalid"])(
    "returns to the page for a %s link",
    async (status) => {
      confirmEmailSubscription.mockResolvedValue({ status, magazine: null });
      const res = await route.POST(post({ t: "abc" }));
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(
        "https://www.aitcommunity.org/en/magazine-subscriptions/confirm?t=abc",
      );
    },
  );
});
