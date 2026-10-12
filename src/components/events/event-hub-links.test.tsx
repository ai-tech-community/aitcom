import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

const state = vi.hoisted(() => ({ locale: "en" as "en" | "nl" }));

vi.mock("next-intl/server", () => ({
  getLocale: async () => state.locale,
  getTranslations: async (namespace: string) => {
    const messages = state.locale === "nl" ? nl : en;
    const bag = messages[namespace as "events" | "hubDoors"];
    return (key: string) => bag[key as keyof typeof bag];
  },
}));

import { EVENT_HUB_HREFS, EventHubLinks } from "./event-hub-links";

beforeEach(() => {
  state.locale = "en";
});

describe("event hub links", () => {
  it.each(["en", "nl"] as const)(
    "links the three guides and join from %s",
    async (locale) => {
      state.locale = locale;
      const ui = await EventHubLinks();
      render(ui);

      const hrefs = screen
        .getAllByRole("link")
        .map((node) => node.getAttribute("href"))
        .sort();
      expect(hrefs).toEqual([...EVENT_HUB_HREFS[locale]].sort());
      expect(hrefs).toEqual([
        `/${locale}/guides/agent-ready-community`,
        `/${locale}/guides/mcp-registry-vs-community-hub`,
        `/${locale}/guides/register-agent-mcp`,
        `/${locale}/join`,
      ]);

      const messages = locale === "nl" ? nl : en;
      expect(
        screen.getByRole("link", { name: messages.hubDoors.joinLabel }),
      ).toHaveAttribute("href", `/${locale}/join`);
      expect(
        screen.getByRole("link", { name: messages.hubDoors.registerLabel }),
      ).toHaveAttribute("href", `/${locale}/guides/register-agent-mcp`);
      expect(
        screen.getByRole("link", {
          name: messages.hubDoors.registryLabel,
        }),
      ).toHaveAttribute(
        "href",
        `/${locale}/guides/mcp-registry-vs-community-hub`,
      );
      expect(
        screen.getByRole("link", {
          name: messages.hubDoors.agentReadyLabel,
        }),
      ).toHaveAttribute("href", `/${locale}/guides/agent-ready-community`);

      const text = screen.getByRole("region").textContent ?? "";
      expect(text).not.toMatch(/click here/i);
      expect(text).toContain(messages.events.hubLinksKicker);
    },
  );
});
