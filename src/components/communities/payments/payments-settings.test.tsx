import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import type { PaymentsActions } from "./payments-view";

const m = vi.hoisted(() => ({
  actions: null as PaymentsActions | null,
  publish: vi.fn(),
  refetch: vi.fn(),
  invalidateList: vi.fn(),
  invalidateAdmin: vi.fn(),
}));

vi.mock("@/trpc/react", () => {
  const mutation = () => ({ mutateAsync: vi.fn(async () => ({})) });
  return {
    api: {
      useUtils: () => ({
        spaces: {
          list: { invalidate: m.invalidateList },
          listForAdmin: { invalidate: m.invalidateAdmin },
        },
      }),
      communityPayments: {
        overview: {
          useQuery: () => ({
            isPending: false,
            isError: false,
            data: {},
            refetch: m.refetch,
          }),
        },
        connect: { useMutation: mutation },
        refresh: { useMutation: mutation },
        selectProvider: { useMutation: mutation },
        createOffer: { useMutation: mutation },
        updateOffer: { useMutation: mutation },
        publishOffer: { useMutation: () => ({ mutateAsync: m.publish }) },
        refund: { useMutation: mutation },
        cancel: { useMutation: mutation },
        paidEntry: { useMutation: mutation },
      },
    },
  };
});
vi.mock("./payments-view", () => ({
  PaymentsView: ({ actions }: { actions: PaymentsActions }) => {
    m.actions = actions;
    return null;
  },
}));
vi.mock("./payment-finance", () => ({ PaymentFinance: () => null }));

import { PaymentsSettings } from "./payments-settings";

const offerId = "30000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  m.actions = null;
  m.publish.mockResolvedValue({ ok: true });
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PaymentsSettings slug="alpha" />
    </NextIntlClientProvider>,
  );
});

describe("PaymentsSettings publishing", () => {
  it("refreshes the community menu after publishing, so a newly shown Offers tab appears", async () => {
    await m.actions!.publishOffer(offerId, true);
    expect(m.publish).toHaveBeenCalledWith({
      slug: "alpha",
      offerId,
      published: true,
    });
    expect(m.invalidateList).toHaveBeenCalledWith({ slug: "alpha" });
    expect(m.invalidateAdmin).toHaveBeenCalledWith({ slug: "alpha" });
  });

  it("does not refresh the menu when publishing fails", async () => {
    m.publish.mockRejectedValue(new Error("no provider"));
    await expect(m.actions!.publishOffer(offerId, true)).rejects.toThrow();
    expect(m.invalidateList).not.toHaveBeenCalled();
  });
});
