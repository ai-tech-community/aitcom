import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { OnboardingAnswersSettings } from "./onboarding-answers-settings";

describe("OnboardingAnswersSettings", () => {
  it("keeps a permanent way back to the onboarding questions", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <OnboardingAnswersSettings />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: new RegExp(en.dashboard.answers.title, "i"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.dashboard.answers.cta }),
    ).toHaveAttribute("href", "/dashboard/onboarding");
  });
});
