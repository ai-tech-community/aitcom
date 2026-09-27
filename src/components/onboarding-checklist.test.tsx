import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../messages/en.json";
import type { OnboardingChecklistView } from "@/components/onboarding/checklist-view";

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

const controller = vi.hoisted(() => ({
  view: { kind: "hidden" } as OnboardingChecklistView,
  sync: undefined as string | undefined,
  completeStep: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("@/components/onboarding/use-onboarding-checklist", () => ({
  useOnboardingChecklist: ({ sync }: { sync: string }) => {
    controller.sync = sync;
    return {
      view: controller.view,
      isLoading: false,
      completeStep: controller.completeStep,
      dismiss: controller.dismiss,
    };
  },
}));

import { OnboardingChecklist } from "./onboarding-checklist";

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <OnboardingChecklist />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  controller.view = {
    kind: "checklist",
    completedCount: 1,
    totalCount: 2,
    percent: 50,
    steps: [
      {
        slug: "complete_profile",
        labelKey: "completeProfile",
        href: "/dashboard",
        completed: true,
      },
      {
        slug: "browse_events",
        labelKey: "browseEvents",
        href: "/events",
        completed: false,
      },
    ],
  };
  controller.completeStep.mockReset();
  controller.dismiss.mockReset();
});

describe("dashboard OnboardingChecklist", () => {
  it("renders the shared checklist and syncs on mount", () => {
    renderCard();
    expect(controller.sync).toBe("on-mount");
    expect(
      screen.getByRole("progressbar", { name: "1 of 2 steps done" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("link", { name: en.onboarding.steps.browseEvents }),
    );
    expect(controller.completeStep).toHaveBeenCalledWith("browse_events");
  });

  it("uses the same account-level dismissal as the reminder", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Don't show again" }));
    expect(controller.dismiss).toHaveBeenCalledTimes(1);
  });

  it("renders nothing once dismissed or complete", () => {
    controller.view = { kind: "hidden" };
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the welcome prompt before the intent questions", () => {
    controller.view = { kind: "welcome" };
    renderCard();
    expect(
      screen.getByText(en.onboarding.welcomeCardTitle),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", {
      name: en.onboarding.welcomeCardCta,
    });
    expect(cta).toHaveAttribute("href", "/dashboard/onboarding");
    // Contrast: ink text, orange only on the non-text arrow marker.
    expect(cta).toHaveClass("text-foreground");
    expect(cta).not.toHaveClass("text-primary");
    expect(cta.querySelector("svg")).toHaveClass("text-primary");
  });
});
