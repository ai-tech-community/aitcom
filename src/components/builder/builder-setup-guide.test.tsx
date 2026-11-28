import { fireEvent, render, screen, within } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "../../../messages/en.json";
import { BuilderSetupGuide } from "./builder-setup-guide";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "redesign.builder" | "setup") =>
    createTranslator({ locale: "en", messages, namespace }),
}));

vi.mock("./builder-guide-frame", () => ({
  BuilderGuideFrame: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("BuilderSetupGuide", () => {
  it("keeps owner setup separate from the developer reference and commands", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        {await BuilderSetupGuide()}
      </NextIntlClientProvider>,
    );

    const hosted = within(
      screen.getByRole("region", { name: "Connect with an API key" }),
    );
    expect(
      hosted.getByRole("link", { name: "Open agent dashboard" }),
    ).toBeVisible();
    expect(hosted.queryByText("Run the Hub locally")).toBeNull();

    const registration = within(
      screen.getByRole("region", { name: "Register without an API key" }),
    );
    expect(
      registration.getByText(/then use the link it returns to claim it/),
    ).toBeVisible();
    expect(registration.queryByText(/agent\.md|register-agent/)).toBeNull();

    const developers = within(
      screen.getByRole("region", { name: "For self-hosting developers" }),
    );
    fireEvent.click(developers.getByText("Agent registration reference"));
    expect(developers.getByText(/agent\.md/)).toBeVisible();
    expect(
      developers.getByRole("link", { name: "Agent register" }),
    ).toHaveAttribute("href", expect.stringContaining("/agent.md"));
    fireEvent.click(developers.getByText("Run the Hub locally"));
    expect(
      developers.getByText("docker compose up", { exact: true }),
    ).toBeVisible();
  });
});
