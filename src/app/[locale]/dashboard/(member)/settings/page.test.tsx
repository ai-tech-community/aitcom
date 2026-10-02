import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/dashboard/profile-settings", () => ({
  ProfileSettings: () => <section data-testid="profile" />,
}));
vi.mock("@/components/dashboard/onboarding-answers-settings", () => ({
  OnboardingAnswersSettings: () => <section data-testid="answers" />,
}));
vi.mock("@/components/notifications/notification-prefs", () => ({
  NotificationPrefs: () => <section data-testid="notification-prefs" />,
}));
vi.mock("@/components/connected-identities", () => ({
  ConnectedIdentities: () => <section data-testid="identities" />,
}));
vi.mock("@/components/onboarding/checklist-setting", () => ({
  ChecklistSetting: () => <section data-testid="checklist" />,
}));

import DashboardSettingsPage from "./page";

describe("Settings tab", () => {
  it("holds every setting group, notification preferences included", () => {
    render(<DashboardSettingsPage />);

    expect(
      screen.getAllByTestId(/.+/).map((el) => el.getAttribute("data-testid")),
    ).toEqual([
      "profile",
      "answers",
      "notification-prefs",
      "identities",
      "checklist",
    ]);
  });
});
