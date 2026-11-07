import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/components/magazines/test-intl";
import { PaymentsView, type PaymentsActions } from "./payments-view";
import { samplePayments } from "./payments-preview";
import type { PaymentsSnapshot } from "@/lib/payments";

function renderView(
  overrides: Partial<PaymentsActions> = {},
  data: PaymentsSnapshot = samplePayments,
) {
  const actions: PaymentsActions = {
    connect: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    selectProvider: vi.fn().mockResolvedValue(undefined),
    createOffer: vi.fn().mockResolvedValue(undefined),
    updateOffer: vi.fn().mockResolvedValue(undefined),
    publishOffer: vi.fn().mockResolvedValue(undefined),
    refund: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    paidEntry: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  renderWithIntl(
    <PaymentsView slug="example" data={data} actions={actions} preview />,
  );
  return actions;
}

describe("owner Payments screen", () => {
  it("lets the owner disable paid entry after unpublishing the final plan", async () => {
    const actions = renderView(
      {},
      {
        ...samplePayments,
        paidEntry: true,
        offers: samplePayments.offers.map((offer) => ({
          ...offer,
          published: false,
        })),
      },
    );
    const toggle = screen.getByRole("checkbox", {
      name: /Require a paid membership/,
    });
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);
    await waitFor(() => expect(actions.paidEntry).toHaveBeenCalledWith(false));
  });
  it("labels sample data and clearly distinguishes AIT and provider fees", () => {
    renderView();
    expect(
      screen.getByText("Existing members who will keep complimentary access"),
    ).toBeInTheDocument();
    expect(screen.getByText(/jamie@example.com/)).toBeInTheDocument();
    expect(screen.getByText("AIT fee: 0%")).toBeInTheDocument();
    expect(
      screen.getByText("Your payment provider’s processing fees still apply."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sample data only/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Stripe" })).toHaveAttribute(
      "href",
      "https://dashboard.stripe.com",
    );
  });
  it("validates a course selection before submitting and saves prices in cents", async () => {
    const actions = renderView();
    fireEvent.click(screen.getByRole("button", { name: "Create offer" }));
    fireEvent.change(screen.getByLabelText("Offer type"), {
      target: { value: "course" },
    });
    fireEvent.change(screen.getByLabelText("Offer name"), {
      target: { value: "AI course" },
    });
    fireEvent.change(screen.getByLabelText("Price in EUR"), {
      target: { value: "29,95" },
    });
    fireEvent.change(screen.getByLabelText("Event or course"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(actions.createOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "course",
          amount: 2995,
          resourceId: 2,
          interval: "once",
        }),
      ),
    );
  });
  it("requires explicit confirmation before requesting a full refund", async () => {
    const actions = renderView();
    fireEvent.click(screen.getByRole("button", { name: "Full refund" }));
    expect(actions.refund).not.toHaveBeenCalled();
    expect(screen.getByText(/Purchased access will end/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Full refund" }));
    await waitFor(() =>
      expect(actions.refund).toHaveBeenCalledWith("sample-paid"),
    );
  });
  it("filters the sales list without hiding the offer list", () => {
    renderView();
    fireEvent.change(screen.getByLabelText("Filter transactions"), {
      target: { value: "donation" },
    });
    const sales = screen.getByRole("region", { name: "Transactions" });
    expect(within(sales).getByText("robin@example.com")).toBeInTheDocument();
    expect(
      within(sales).queryByText("alex@example.com"),
    ).not.toBeInTheDocument();
  });
  it("keeps failed actions visible and recoverable", async () => {
    renderView({
      refresh: vi.fn().mockRejectedValue(new Error("private data")),
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Refresh the page and try again.",
    );
    expect(screen.queryByText("private data")).not.toBeInTheDocument();
  });
});
