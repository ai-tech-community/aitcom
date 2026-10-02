import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
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

import { GetStartedCard } from "./get-started-card";

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GetStartedCard />
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

describe("GetStartedCard", () => {
  it("renders the shared checklist under its own heading and syncs on mount", () => {
    renderCard();
    expect(controller.sync).toBe("on-mount");
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: new RegExp(en.dashboard.getStarted.title, "i"),
      }),
    ).toBeInTheDocument();
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
    const dismiss = screen.getByRole("button", { name: "Don't show again" });
    // A 32px target (WCAG 2.2 target size, with room to spare).
    expect(dismiss).toHaveClass("size-8");
    fireEvent.click(dismiss);
    expect(controller.dismiss).toHaveBeenCalledTimes(1);
  });

  it("renders nothing, heading included, once dismissed or complete", () => {
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
    // Contrast and One Voice: ink text and arrow; the dashboard's one
    // orange is the active tab.
    expect(cta).toHaveClass("text-foreground");
    expect(cta).not.toHaveClass("text-primary");
    expect(cta.querySelector("svg")).not.toHaveClass("text-primary");
  });
});
