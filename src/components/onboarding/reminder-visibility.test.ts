import { describe, expect, it } from "vitest";

import type { OnboardingChecklistView } from "./checklist-view";
import { isReminderRoute, shouldShowReminder } from "./reminder-visibility";

const incomplete: OnboardingChecklistView = {
  kind: "checklist",
  steps: [],
  completedCount: 2,
  totalCount: 5,
  percent: 40,
};

describe("isReminderRoute", () => {
  it.each(["/", "/events", "/community", "/dashboard/agent", "/members/"])(
    "shows on %s",
    (path) => {
      expect(isReminderRoute(path)).toBe(true);
    },
  );

  it.each([
    "/dashboard",
    "/dashboard/",
    "/dashboard/onboarding",
    "/auth/signin",
    "/auth/signup",
    "/auth/forgot-password",
    "/auth",
  ])("stays out of the way on %s", (path) => {
    expect(isReminderRoute(path)).toBe(false);
  });

  it("does not treat look-alike paths as auth pages", () => {
    expect(isReminderRoute("/authors")).toBe(true);
  });
});

describe("shouldShowReminder", () => {
  it("shows for an incomplete member on a normal page", () => {
    expect(
      shouldShowReminder({
        pathname: "/events",
        view: incomplete,
        hiddenForVisit: false,
      }),
    ).toBe(true);
  });

  it("shows the welcome state too", () => {
    expect(
      shouldShowReminder({
        pathname: "/events",
        view: { kind: "welcome" },
        hiddenForVisit: false,
      }),
    ).toBe(true);
  });

  it("hides when onboarding is done or dismissed (presenter says hidden)", () => {
    expect(
      shouldShowReminder({
        pathname: "/events",
        view: { kind: "hidden" },
        hiddenForVisit: false,
      }),
    ).toBe(false);
  });

  it("hides on the dashboard, where the full checklist is shown", () => {
    expect(
      shouldShowReminder({
        pathname: "/dashboard",
        view: incomplete,
        hiddenForVisit: false,
      }),
    ).toBe(false);
  });

  it("hides on auth pages", () => {
    expect(
      shouldShowReminder({
        pathname: "/auth/signin",
        view: incomplete,
        hiddenForVisit: false,
      }),
    ).toBe(false);
  });

  it("hides for the rest of the visit after hide-for-now", () => {
    expect(
      shouldShowReminder({
        pathname: "/events",
        view: incomplete,
        hiddenForVisit: true,
      }),
    ).toBe(false);
  });
});
