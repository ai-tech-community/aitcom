// @vitest-environment node
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../../../../messages/en.json";

const state = vi.hoisted(() => ({
  share: null as unknown,
  asked: [] as unknown[],
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (opts: { namespace?: string }) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: opts.namespace as never,
    }),
}));

vi.mock("@/server/members/profile-page", () => ({
  getMemberBadge: async (userId: string, slug: string) => {
    state.asked.push([userId, slug]);
    return state.share;
  },
}));

import { catalogBadge } from "@/lib/badges/catalog";

import { GET } from "./route";

function call(slug = "article_author", locale = "en") {
  return GET(new Request("http://localhost/x") as never, {
    params: Promise.resolve({ locale, id: "u1", slug }),
  });
}

function share(reach: "public" | "ownerOnly") {
  return {
    badge: catalogBadge("article_author"),
    earnedAt: new Date("2026-03-03T12:00:00Z"),
    data: {
      profile: { displayName: "Ada Lovelace" },
      reach:
        reach === "public"
          ? { kind: "public" }
          : { kind: "ownerOnly", reason: "private" },
    },
  };
}

beforeEach(() => {
  state.share = null;
  state.asked = [];
});

describe("badge share image", () => {
  it("is a 404 when the page would be (not visible, or not held)", async () => {
    const res = await call();
    expect(res.status).toBe(404);
    expect(state.asked).toEqual([["u1", "article_author"]]);
  });

  it("draws a PNG for a visible badge, cacheable while the profile is public", async () => {
    state.share = share("public");
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=3600, s-maxage=3600",
    );
    const png = Buffer.from(await res.arrayBuffer());
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  });

  it("is never cached for the owner's private profile", async () => {
    state.share = share("ownerOnly");
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
