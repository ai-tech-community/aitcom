import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import { createMemoryStorage } from "@/test/memory-storage";
import type { OnboardingChecklistView } from "./checklist-view";
import type { OnboardingChecklistController } from "./use-onboarding-checklist";

const nav = vi.hoisted(() => ({ pathname: "/events" }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => nav.pathname,
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
  completeStep: vi.fn(),
  dismiss: vi.fn(),
  lastSync: undefined as string | undefined,
}));
vi.mock("./use-onboarding-checklist", () => ({
  useOnboardingChecklist: ({
    sync,
  }: {
    sync: string;
  }): OnboardingChecklistController => {
    controller.lastSync = sync;
    return {
      view: controller.view,
      isLoading: false,
      completeStep: controller.completeStep,
      dismiss: controller.dismiss,
    };
  },
}));

import { OnboardingReminder } from "./onboarding-reminder";
import { resetHiddenForVisitForTests } from "./use-hidden-for-visit";

const INCOMPLETE: OnboardingChecklistView = {
  kind: "checklist",
  completedCount: 2,
  totalCount: 5,
  percent: 40,
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
      completed: true,
    },
    {
      slug: "read_article",
      labelKey: "readArticle",
      href: "/blog",
      completed: false,
    },
    {
      slug: "follow_members",
      labelKey: "followMembers",
      href: null,
      completed: false,
    },
    {
      slug: "setup_agent",
      labelKey: "setupAgent",
      href: "/dashboard/agent",
      completed: false,
    },
  ],
};

function renderReminder(locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <OnboardingReminder />
    </NextIntlClientProvider>,
  );
}

const pill = () =>
  screen.getByRole("button", { name: /getting started.*2 of 5 steps done/i });

beforeEach(() => {
  nav.pathname = "/events";
  controller.view = INCOMPLETE;
  controller.completeStep.mockReset();
  controller.dismiss.mockReset();
  resetHiddenForVisitForTests();
  vi.stubGlobal("sessionStorage", createMemoryStorage());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OnboardingReminder visibility", () => {
  it("shows a closed pill with progress for an incomplete member", () => {
    renderReminder();
    expect(pill()).toHaveAttribute("aria-expanded", "false");
    expect(pill()).toHaveTextContent("2/5");
    // Never auto-opens on arrival.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is hidden when onboarding is done or dismissed", () => {
    controller.view = { kind: "hidden" };
    const { container } = renderReminder();
    expect(container).toBeEmptyDOMElement();
  });

  it("is hidden on the dashboard and does not sync there", () => {
    nav.pathname = "/dashboard";
    const { container } = renderReminder();
    expect(container).toBeEmptyDOMElement();
    expect(controller.lastSync).toBe("off");
  });

  it("is hidden on auth pages", () => {
    nav.pathname = "/auth/signin";
    const { container } = renderReminder();
    expect(container).toBeEmptyDOMElement();
  });

  it("syncs only on finish on normal pages", () => {
    renderReminder();
    expect(controller.lastSync).toBe("on-finish");
  });

  it("shows a count-free pill in the welcome state", () => {
    controller.view = { kind: "welcome" };
    renderReminder();
    const button = screen.getByRole("button", { name: /getting started/i });
    expect(button).not.toHaveTextContent("/");
  });

  it("uses Dutch copy", () => {
    renderReminder("nl");
    expect(
      screen.getByRole("button", {
        name: /aan de slag.*2 van 5 stappen klaar/i,
      }),
    ).toBeInTheDocument();
  });
});

describe("OnboardingReminder panel", () => {
  it("opens a named, non-modal panel with the shared checklist", () => {
    renderReminder();
    fireEvent.click(pill());

    const panel = screen.getByRole("dialog", { name: "Getting started" });
    expect(pill()).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("aria-modal", "true");
    expect(
      screen.getByRole("progressbar", { name: "2 of 5 steps done" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.onboarding.steps.readArticle }),
    ).toHaveAttribute("href", "/blog");
    // Done steps are marked in text, not by colour alone.
    expect(panel).toHaveTextContent(
      `${en.onboarding.steps.browseEvents}(done)`,
    );
  });

  it("moves focus into the panel, closes on Escape and returns focus to the pill", async () => {
    renderReminder();
    const trigger = pill();
    trigger.focus();
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog");
    await waitFor(() =>
      expect(panel).toContainElement(document.activeElement as HTMLElement),
    );

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(pill()));
  });

  it("the close button closes the panel", () => {
    renderReminder();
    fireEvent.click(pill());
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("following a step records it and closes the panel", () => {
    renderReminder();
    fireEvent.click(pill());
    fireEvent.click(
      screen.getByRole("link", { name: en.onboarding.steps.readArticle }),
    );
    expect(controller.completeStep).toHaveBeenCalledWith("read_article");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it('"Don\'t show again" calls the account-level dismissal', () => {
    renderReminder();
    fireEvent.click(pill());
    fireEvent.click(screen.getByRole("button", { name: "Don't show again" }));
    expect(controller.dismiss).toHaveBeenCalledTimes(1);
  });

  it('"Hide until next visit" hides it for this browser session only', () => {
    const { container, unmount } = renderReminder();
    fireEvent.click(pill());
    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Hide until next visit" }),
      );
    });
    expect(controller.dismiss).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
    expect(sessionStorage.getItem("onboarding-reminder-hidden")).toBe("1");

    // Same session, next page: still hidden.
    unmount();
    resetHiddenForVisitForTests();
    const again = renderReminder();
    expect(again.container).toBeEmptyDOMElement();
  });
});

describe("onboarding translations", () => {
  function keys(value: unknown, prefix = ""): string[] {
    if (typeof value !== "object" || value === null) return [prefix];
    return Object.entries(value).flatMap(([key, child]) =>
      keys(child, prefix ? `${prefix}.${key}` : key),
    );
  }

  it("has the same onboarding keys in EN and NL, all filled", () => {
    expect(keys(nl.onboarding).sort()).toEqual(keys(en.onboarding).sort());
    for (const messages of [en.onboarding.reminder, nl.onboarding.reminder]) {
      for (const text of Object.values(messages)) {
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
