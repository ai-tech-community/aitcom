"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PaymentsSnapshot } from "@/lib/payments";
import { PaymentsView, type PaymentsActions } from "./payments-view";
import { OfferPurchaseView } from "./offer-purchase-view";
import { Button } from "@/components/ui/button";
import { PaymentFinanceView } from "./payment-finance-view";

export const samplePayments: PaymentsSnapshot = {
  activeProvider: "stripe",
  paidEntry: false,
  complimentaryMembers: [{ name: "Jamie", email: "jamie@example.com" }],
  providers: [
    {
      provider: "stripe",
      available: true,
      connected: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      accountLabel: "Example community",
      environment: "test",
    },
    {
      provider: "adyen",
      available: true,
      connected: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      accountLabel: null,
      environment: "test",
    },
  ],
  offers: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      title: "Community membership",
      description: "Monthly access to our community.",
      kind: "membership",
      amount: 1500,
      currency: "EUR",
      interval: "month",
      resourceId: null,
      published: true,
      provider: "stripe",
      editable: false,
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      title: "Build together: an evening workshop",
      description: "A hands-on community workshop.",
      kind: "event",
      amount: 2500,
      currency: "EUR",
      interval: "once",
      resourceId: 1,
      published: true,
      provider: "stripe",
      editable: false,
    },
    {
      id: "10000000-0000-4000-8000-000000000003",
      title: "Practical AI foundations",
      description: "Learn at your own pace.",
      kind: "course",
      amount: 4900,
      currency: "EUR",
      interval: "once",
      resourceId: 2,
      published: false,
      provider: "stripe",
      editable: true,
    },
    {
      id: "10000000-0000-4000-8000-000000000004",
      title: "Support the next meetup",
      description: "Help keep the community going.",
      kind: "donation",
      amount: 1000,
      currency: "EUR",
      interval: "once",
      resourceId: null,
      published: true,
      provider: "stripe",
      editable: false,
    },
  ],
  transactions: [
    {
      id: "sample-paid",
      title: "Community membership",
      kind: "membership",
      amount: 1500,
      currency: "EUR",
      buyerEmail: "alex@example.com",
      status: "paid",
      createdAt: new Date("2026-11-07T10:00:00Z"),
      receiptUrl: null,
      fulfillment: "fulfilled",
    },
    {
      id: "sample-pending",
      title: "Build together: an evening workshop",
      kind: "event",
      amount: 2500,
      currency: "EUR",
      buyerEmail: "sam@example.com",
      status: "pending",
      createdAt: new Date("2026-11-07T09:00:00Z"),
      receiptUrl: null,
      fulfillment: "pending",
    },
    {
      id: "sample-refunded",
      title: "Support the next meetup",
      kind: "donation",
      amount: 1000,
      currency: "EUR",
      buyerEmail: "robin@example.com",
      status: "refunded",
      createdAt: new Date("2026-11-06T09:00:00Z"),
      receiptUrl: null,
      fulfillment: "revoked",
    },
  ],
  subscriptions: [
    {
      kind: "membership",
      id: "sample-subscription",
      title: "Community membership",
      buyerEmail: "alex@example.com",
      provider: "stripe",
      status: "active",
      paidThrough: new Date("2026-12-07T10:00:00Z"),
      cancelAtPeriodEnd: false,
    },
  ],
  resources: [
    { id: 1, title: "Build together: an evening workshop", kind: "event" },
    { id: 2, title: "Practical AI foundations", kind: "course" },
  ],
};

export function PaymentsPreview() {
  const t = useTranslations("payments");
  const [data, setData] = useState<PaymentsSnapshot>(samplePayments);
  const [scenario, setScenario] = useState("active");
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [checkoutState, setCheckoutState] = useState("pending");
  const [showOutcome, setShowOutcome] = useState(false);
  const actions: PaymentsActions = {
    connect: async (provider) =>
      setData((current) => ({
        ...current,
        providers: current.providers.map((item) =>
          item.provider === provider
            ? {
                ...item,
                connected: true,
                chargesEnabled: true,
                payoutsEnabled: true,
                accountLabel: "Example community",
              }
            : item,
        ),
      })),
    refresh: async () => undefined,
    selectProvider: async (provider) =>
      setData((current) => ({ ...current, activeProvider: provider })),
    createOffer: async (offer) =>
      setData((current) => ({
        ...current,
        offers: [
          ...current.offers,
          {
            ...offer,
            id: crypto.randomUUID(),
            published: false,
            editable: true,
            provider: current.activeProvider!,
          },
        ],
      })),
    updateOffer: async (id, input) =>
      setData((current) => ({
        ...current,
        offers: current.offers.map((offer) =>
          offer.id === id ? { ...offer, ...input } : offer,
        ),
      })),
    publishOffer: async (id, published) =>
      setData((current) => ({
        ...current,
        offers: current.offers.map((offer) =>
          offer.id === id
            ? { ...offer, published, editable: offer.editable && !published }
            : offer,
        ),
      })),
    refund: async (id) =>
      setData((current) => ({
        ...current,
        transactions: current.transactions.map((order) =>
          order.id === id ? { ...order, status: "refund_pending" } : order,
        ),
      })),
    cancel: async (id) =>
      setData((current) => ({
        ...current,
        subscriptions: current.subscriptions.map((subscription) =>
          subscription.id === id
            ? { ...subscription, cancelAtPeriodEnd: true }
            : subscription,
        ),
      })),
    paidEntry: async (enabled) =>
      setData((current) => ({ ...current, paidEntry: enabled })),
  };
  const selectedOffer = data.offers.find(
    (offer) => offer.id === selectedOfferId,
  );
  return (
    <div
      className="mx-auto max-w-5xl px-4 py-8 sm:px-8"
      onClick={(event) => {
        const href =
          event.target instanceof Element
            ? event.target.closest("a")?.getAttribute("href")
            : null;
        const offerId = href?.match(/\/offers\/([^/?]+)/)?.[1];
        if (offerId) {
          event.preventDefault();
          setSelectedOfferId(offerId);
          setShowOutcome(false);
        }
        if (href?.startsWith("/api/payments/export")) {
          event.preventDefault();
          const blob = new Blob(
            [
              "Sample data only\nOffer,Amount in cents,Status\n" +
                data.transactions
                  .map(
                    (order) => `${order.title},${order.amount},${order.status}`,
                  )
                  .join("\n"),
            ],
            { type: "text/csv" },
          );
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = "sample-payments.csv";
          link.click();
          URL.revokeObjectURL(link.href);
        }
      }}
    >
      <div className="border-border mb-8 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <a href="?" className="font-semibold">
          AIT Community · {t("sampleData").split(" · ")[0]}
        </a>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          {t("providerTitle")}
          <select
            className="border-input bg-background h-10 rounded-md border px-3"
            value={scenario}
            onChange={(event) => {
              const value = event.target.value;
              setScenario(value);
              setData(
                value === "empty"
                  ? {
                      ...samplePayments,
                      activeProvider: null,
                      offers: [],
                      transactions: [],
                      subscriptions: [],
                      providers: samplePayments.providers.map((provider) => ({
                        ...provider,
                        connected: false,
                        chargesEnabled: false,
                        payoutsEnabled: false,
                      })),
                    }
                  : value === "adyen"
                    ? {
                        ...samplePayments,
                        activeProvider: "adyen",
                        providers: samplePayments.providers.map((provider) => ({
                          ...provider,
                          connected: provider.provider === "adyen",
                          chargesEnabled: provider.provider === "adyen",
                          payoutsEnabled: provider.provider === "adyen",
                          accountLabel:
                            provider.provider === "adyen"
                              ? "Example community"
                              : null,
                        })),
                      }
                    : samplePayments,
              );
            }}
          >
            <option value="active">Stripe · {t("paymentsReady")}</option>
            <option value="empty">{t("notConnected")}</option>
            <option value="adyen">Adyen · {t("paymentsReady")}</option>
          </select>
        </label>
      </div>
      {selectedOffer ? (
        <div className="mx-auto max-w-2xl space-y-6">
          <Button variant="outline" onClick={() => setSelectedOfferId(null)}>
            {t("backToPayments")}
          </Button>
          <p className="bg-muted rounded-lg p-4 text-sm">{t("sampleData")}</p>
          {showOutcome && (
            <section
              role="status"
              className="border-border space-y-3 rounded-xl border p-5"
            >
              <label className="text-sm">
                {t("previewOutcome")}
                <select
                  className="border-input bg-background ml-2 rounded-md border p-2"
                  value={checkoutState}
                  onChange={(event) => setCheckoutState(event.target.value)}
                >
                  {["pending", "paid", "failed", "refunded"].map((state) => (
                    <option key={state} value={state}>
                      {t(state)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="font-semibold">{t(checkoutState)}</p>
              <p className="text-muted-foreground text-sm">
                {t(
                  checkoutState === "paid"
                    ? "thankYou"
                    : checkoutState === "refunded"
                      ? "refundComplete"
                      : "fulfillmentPending",
                )}
              </p>
            </section>
          )}
          <OfferPurchaseView
            offer={selectedOffer}
            slug="example"
            signedIn
            admitted
            onCheckout={async () => {
              setCheckoutState("pending");
              setShowOutcome(true);
            }}
          />
        </div>
      ) : (
        <div className="space-y-9">
          <PaymentsView slug="example" data={data} actions={actions} preview />
          {data.activeProvider && (
            <PaymentFinanceView
              data={{
                currency: "EUR",
                balance: 1430,
                available: 1000,
                payouts: [
                  {
                    id: "sample-payout",
                    amount: 2500,
                    status: "paid",
                    date: new Date("2026-11-05T12:00:00Z"),
                  },
                ],
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
