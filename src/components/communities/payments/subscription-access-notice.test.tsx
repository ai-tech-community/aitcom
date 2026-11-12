import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithIntl } from "@/components/magazines/test-intl";
import { SubscriptionAccessNotice } from "./subscription-access-notice";

const subscription = {
  kind: "membership" as const,
  status: "past_due" as const,
  paidThrough: new Date("2026-11-01"),
  cancelAtPeriodEnd: false,
};
it("shows the grace deadline while access is still available", () => {
  renderWithIntl(
    <SubscriptionAccessNotice
      subscription={subscription}
      now={new Date("2026-11-05")}
    />,
  );
  expect(
    screen.getByText(/Membership access continues until Nov 8, 2026/),
  ).toBeInTheDocument();
});
it("shows expired access when the same grace deadline has passed", () => {
  renderWithIntl(
    <SubscriptionAccessNotice
      subscription={subscription}
      now={new Date("2026-11-09")}
    />,
  );
  expect(
    screen.getByText("Paid membership access ended on Nov 8, 2026."),
  ).toBeInTheDocument();
});
