import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../../messages/en.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({
        locale: "en",
        messages: en,
        namespace: namespace as never,
      }),
  };
});
vi.mock("@/lib/metadata", () => ({
  localeAlternates: async () => ({}),
  buildOgMeta: () => ({}),
}));

import {
  COLLECTOR_OPT_OUT_EMAIL,
  COLLECTOR_ROBOTS_TOKEN,
  COLLECTOR_USER_AGENT,
} from "@/server/collectors/identity";
import CollectorAboutPage from "./page";

describe("collector about page", () => {
  it("shows the exact user agent, the robots.txt block and the opt-out address", async () => {
    render(await CollectorAboutPage());
    expect(screen.getByText(COLLECTOR_USER_AGENT)).toBeInTheDocument();
    expect(
      screen.getByText(`User-agent: ${COLLECTOR_ROBOTS_TOKEN}`, {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: COLLECTOR_OPT_OUT_EMAIL }),
    ).toHaveAttribute("href", `mailto:${COLLECTOR_OPT_OUT_EMAIL}`);
  });

  it("names the page the user agent links to", () => {
    expect(COLLECTOR_USER_AGENT).toBe(
      "aitcom-collector/1.0 (+https://aitcommunity.org/collectors/about)",
    );
  });
});
