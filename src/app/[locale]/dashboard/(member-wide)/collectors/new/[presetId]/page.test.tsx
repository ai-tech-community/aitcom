import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  enabled: true,
  redirect: vi.fn((): never => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/collectors/flags", () => ({
  collectorsEnabled: () => h.enabled,
}));
vi.mock("@/server/dashboard/require-dashboard-session", () => ({
  requireDashboardSession: async () => ({ user: { id: "u" } }),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "nl" }));
vi.mock("next/navigation", () => ({ notFound: h.notFound }));
vi.mock("@/i18n/navigation", () => ({ permanentRedirect: h.redirect }));
vi.mock("@/components/collectors/start-run-form", () => ({
  StartRunForm: (props: object) => (
    <pre data-testid="form">{JSON.stringify(props)}</pre>
  ),
}));

import StartCollectorRunPage from "./page";

const page = (
  presetId: string,
  query: Record<string, string | string[] | undefined> = {},
) =>
  StartCollectorRunPage({
    params: Promise.resolve({ presetId }),
    searchParams: Promise.resolve(query),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.enabled = true;
});

describe("start page", () => {
  it.each([
    ["feed-items", "/dashboard/collectors/new/feed"],
    [
      "page-list",
      "/dashboard/collectors/new/custom-page?url=https%3A%2F%2Fe.com%2Fjobs",
    ],
  ])(
    "sends the old address /new/%s to its preset, keeping the query",
    async (former, href) => {
      const query = former === "page-list" ? { url: "https://e.com/jobs" } : {};
      await expect(page(former, query)).rejects.toThrow("NEXT_REDIRECT");
      expect(h.redirect).toHaveBeenCalledWith({ href, locale: "nl" });
    },
  );

  it("opens the preset with the pasted values and the recognised mark", async () => {
    render(
      await page("feed", {
        url: ["https://e.com/feed.xml", "x"],
        recognised: "1",
      }),
    );
    expect(JSON.parse(screen.getByTestId("form").textContent)).toEqual({
      presetId: "feed",
      prefill: { url: "https://e.com/feed.xml" },
      recognised: true,
    });
  });

  it.each(["constructor", "__proto__", "nope"])(
    "treats %j as an ordinary unknown preset",
    async (id) => {
      render(await page(id));
      expect(JSON.parse(screen.getByTestId("form").textContent).presetId).toBe(
        id,
      );
      expect(h.redirect).not.toHaveBeenCalled();
    },
  );

  it("is not found while collectors are off", async () => {
    h.enabled = false;
    await expect(page("feed")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
