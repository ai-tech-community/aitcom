import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/components/magazines/test-intl";
import { OfferPurchaseView } from "./offer-purchase-view";
import { samplePayments } from "./payments-preview";

describe("member purchase screen", () => {
  it("allows public one-off support without community admission", async () => {
    const checkout = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(
      <OfferPurchaseView
        offer={samplePayments.offers[3]!}
        slug="example"
        signedIn={false}
        admitted={false}
        onCheckout={checkout}
      />,
    );
    fireEvent.change(screen.getByLabelText("Email for your receipt"), {
      target: { value: "supporter@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to secure checkout" }),
    );
    await waitFor(() =>
      expect(checkout).toHaveBeenCalledWith({
        email: "supporter@example.com",
        amount: 1000,
        consent: false,
      }),
    );
  });
  it("requires explicit recurring consent before checkout", async () => {
    const checkout = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(
      <OfferPurchaseView
        offer={samplePayments.offers[0]!}
        slug="example"
        signedIn
        admitted
        onCheckout={checkout}
      />,
    );
    fireEvent.change(screen.getByLabelText("Email for your receipt"), {
      target: { value: "buyer@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to secure checkout" }),
    );
    expect(checkout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to secure checkout" }),
    );
    await waitFor(() =>
      expect(checkout).toHaveBeenCalledWith({
        email: "buyer@example.com",
        consent: true,
        amount: undefined,
      }),
    );
  });
  it("keeps draft offers visible to review without enabling payment", () => {
    renderWithIntl(
      <OfferPurchaseView
        offer={samplePayments.offers[2]!}
        slug="example"
        signedIn
        admitted
        onCheckout={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Continue to secure checkout" }),
    ).toBeDisabled();
    expect(screen.getByText(/Draft preview/)).toBeInTheDocument();
  });
  it("directs existing subscribers to their billing controls", () => {
    renderWithIntl(
      <OfferPurchaseView
        offer={samplePayments.offers[0]!}
        slug="example"
        signedIn
        admitted
        membershipExists
        onCheckout={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: "My payments" })).toHaveAttribute(
      "href",
      "/en/dashboard/payments",
    );
    expect(
      screen.queryByRole("button", { name: "Continue to secure checkout" }),
    ).not.toBeInTheDocument();
  });
});
