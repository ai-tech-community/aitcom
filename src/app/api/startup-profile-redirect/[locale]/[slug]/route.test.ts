import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: 0,
  slug: null as string | null,
}));

vi.mock("@/server/startups/queries", () => ({
  findApprovedPublicStartupBySlug: async (slug: string) => {
    state.calls += 1;
    if (state.slug !== slug) return null;
    return { slug };
  },
}));

import { GET } from "./route";

function visit(locale: string, slug: string) {
  return GET(
    new Request(
      `https://www.aitcommunity.org/api/startup-profile-redirect/${locale}/${slug}`,
    ),
    { params: Promise.resolve({ locale, slug }) },
  );
}

beforeEach(() => {
  state.calls = 0;
  state.slug = null;
});

describe("same-entity startup redirect", () => {
  it("301s an approved company to /startups/<slug>", async () => {
    state.slug = "acme";
    const response = await visit("en", "acme");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://www.aitcommunity.org/en/startups/acme",
    );
    expect(state.calls).toBe(1);
  });

  it("404s when no approved company uses that slug", async () => {
    const response = await visit("nl", "missing-co");
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(state.calls).toBe(1);
  });

  it("does not look up Navier AI or the AI tools hub", async () => {
    state.slug = "navier-ai";
    const navier = await visit("en", "navier-ai");
    const hub = await visit("fr", "ai-tools-list");
    expect(navier.status).toBe(404);
    expect(hub.status).toBe(404);
    expect(state.calls).toBe(0);
  });
});
