"use client";
import { SubscriptionAccessNotice } from "./subscription-access-notice";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowUpRight,
  Check,
  CreditCard,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatPaymentAmount,
  offerInputSchema,
  parsePaymentAmount,
  type BillingInterval,
  type OfferInput,
  type OfferKind,
  type PaymentProvider,
  type PaymentsSnapshot,
} from "@/lib/payments";

export interface PaymentsActions {
  connect(
    this: void,
    provider: PaymentProvider,
    country: string,
    entityType: "individual" | "organization",
  ): Promise<void>;
  refresh(this: void): Promise<void>;
  selectProvider(this: void, provider: PaymentProvider): Promise<void>;
  createOffer(this: void, offer: OfferInput): Promise<void>;
  updateOffer(this: void, id: string, offer: OfferInput): Promise<void>;
  publishOffer(this: void, id: string, published: boolean): Promise<void>;
  refund(this: void, id: string): Promise<void>;
  cancel(this: void, id: string): Promise<void>;
  paidEntry(this: void, enabled: boolean): Promise<void>;
}

export function PaymentsView({
  slug,
  data,
  actions,
  preview = false,
}: {
  slug: string;
  data: PaymentsSnapshot;
  actions: PaymentsActions;
  preview?: boolean;
}) {
  const t = useTranslations("payments");
  const locale = useLocale();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<
    PaymentsSnapshot["offers"][number] | null
  >(null);
  const [country, setCountry] = useState("NL");
  const [entityType, setEntityType] = useState<"individual" | "organization">(
    "organization",
  );
  const [filter, setFilter] = useState("all");
  const [confirmRefund, setConfirmRefund] = useState<string | null>(null);
  async function run(key: string, action: () => Promise<void>) {
    setError(null);
    setBusy(key);
    try {
      await action();
    } catch {
      setError(t("actionFailed"));
    } finally {
      setBusy(null);
    }
  }
  const transactions = data.transactions.filter(
    (item) => filter === "all" || item.kind === filter,
  );
  const currency = (value: number) => formatPaymentAmount(value, locale);
  const collected = data.transactions
    .filter((item) =>
      ["paid", "refund_pending", "refunded"].includes(item.status),
    )
    .reduce((total, item) => total + item.amount, 0);
  const refunded = data.transactions.reduce(
    (total, item) =>
      total +
      (item.refundedAmount ?? (item.status === "refunded" ? item.amount : 0)),
    0,
  );
  return (
    <div className="space-y-9">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-prose space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("intro")}</p>
        </div>
        <Button
          variant="outline"
          disabled={!!busy}
          onClick={() => void run("refresh", actions.refresh)}
        >
          <RefreshCw
            aria-hidden="true"
            className={
              busy === "refresh"
                ? "size-4 animate-spin motion-reduce:animate-none"
                : "size-4"
            }
          />
          {t("refresh")}
        </Button>
      </header>
      {preview && (
        <p role="status" className="bg-muted rounded-lg px-4 py-3 text-sm">
          {t("sampleData")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-y py-4">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <Check className="text-success size-4" aria-hidden="true" />
          {t("zeroFee")}
        </span>
        <span className="text-muted-foreground text-sm">
          {t("providerFees")}
        </span>
      </div>
      <section aria-labelledby="provider-heading" className="space-y-4">
        <div>
          <h2 id="provider-heading" className="text-lg font-semibold">
            {t("providerTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("providerDescription")}
          </p>
        </div>
        <div className="divide-border divide-y rounded-xl border">
          {data.providers.map((provider) => (
            <div
              key={provider.provider}
              className="flex flex-wrap items-center justify-between gap-4 p-5"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">
                    {provider.provider === "stripe" ? "Stripe" : "Adyen"}
                  </h3>
                  {provider.provider === "stripe" && (
                    <span className="text-muted-foreground text-xs">
                      {t("recommended")}
                    </span>
                  )}
                  {data.activeProvider === provider.provider && (
                    <span className="bg-success/10 text-success rounded px-2 py-0.5 text-xs">
                      {t("selected")}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">
                  {!provider.available
                    ? t("notAvailable")
                    : !provider.connected
                      ? t("notConnected")
                      : provider.chargesEnabled
                        ? t("paymentsReady")
                        : t("setupIncomplete")}
                </p>
                {provider.connected && (
                  <p className="text-muted-foreground text-xs">
                    {provider.accountLabel} · {t(provider.environment)} ·{" "}
                    {t(
                      provider.payoutsEnabled
                        ? "payoutsReady"
                        : "payoutsPending",
                    )}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {provider.connected &&
                  provider.chargesEnabled &&
                  data.activeProvider !== provider.provider && (
                    <Button
                      variant="outline"
                      disabled={!!busy}
                      onClick={() =>
                        void run(provider.provider, () =>
                          actions.selectProvider(provider.provider),
                        )
                      }
                    >
                      {t("useProvider", {
                        provider:
                          provider.provider === "stripe" ? "Stripe" : "Adyen",
                      })}
                    </Button>
                  )}
                {provider.provider === "stripe" && provider.connected && (
                  <Button asChild variant="outline">
                    <a
                      href="https://dashboard.stripe.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("dashboard")}
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </a>
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={!!busy || !provider.available}
                  onClick={() =>
                    void run(provider.provider, () =>
                      actions.connect(provider.provider, country, entityType),
                    )
                  }
                >
                  {busy === provider.provider && (
                    <Loader2
                      className="size-4 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  )}
                  {t(provider.connected ? "continueSetup" : "connect")}
                </Button>
              </div>
            </div>
          ))}
        </div>
        {data.providers.some(
          (provider) =>
            provider.provider === "adyen" &&
            provider.available &&
            !provider.connected,
        ) && (
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label htmlFor="payment-country">{t("country")}</Label>
              <select
                id="payment-country"
                className="border-input bg-background h-10 rounded-md border px-3 text-sm"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              >
                {["NL", "BE", "DE", "FR", "GB", "IE", "ES", "IT", "US"].map(
                  (code) => (
                    <option key={code} value={code}>
                      {new Intl.DisplayNames(locale, { type: "region" }).of(
                        code,
                      )}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-entity">{t("entityType")}</Label>
              <select
                id="payment-entity"
                className="border-input bg-background h-10 rounded-md border px-3 text-sm"
                value={entityType}
                onChange={(event) =>
                  setEntityType(event.target.value as typeof entityType)
                }
              >
                <option value="organization">{t("organization")}</option>
                <option value="individual">{t("individual")}</option>
              </select>
            </div>
          </div>
        )}
      </section>
      <section aria-labelledby="offers-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="offers-heading" className="text-lg font-semibold">
              {t("offersTitle")}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("offersDescription")}
            </p>
          </div>
          <Button
            disabled={!!busy || !data.activeProvider}
            onClick={() => {
              setEditing(null);
              setShowForm(!showForm);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t(showForm ? "close" : "newOffer")}
          </Button>
        </div>
        {showForm && (
          <OfferForm
            key={editing?.id ?? "new"}
            initial={editing ?? undefined}
            resources={data.resources}
            busy={!!busy}
            onSubmit={(offer) =>
              run("offer", async () => {
                if (editing) await actions.updateOffer(editing.id, offer);
                else await actions.createOffer(offer);
                setShowForm(false);
                setEditing(null);
              })
            }
          />
        )}
        {!data.offers.length ? (
          <div className="border-border rounded-xl border border-dashed px-6 py-10 text-center">
            <CreditCard
              className="text-muted-foreground mx-auto mb-3 size-6"
              aria-hidden="true"
            />
            <p className="font-medium">{t("emptyOffers")}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {t(data.activeProvider ? "emptyOffersHelp" : "connectFirst")}
            </p>
          </div>
        ) : (
          <ul className="divide-border divide-y">
            {data.offers.map((offer) => (
              <li
                key={offer.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">{offer.title}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {t(offer.kind)} ·{" "}
                    {offer.provider === "stripe" ? "Stripe" : "Adyen"} ·{" "}
                    {currency(offer.amount)}
                    {offer.interval !== "once"
                      ? ` / ${t(offer.interval)}`
                      : ""}{" "}
                    · {t(offer.published ? "published" : "draft")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.activeProvider &&
                    offer.provider !== data.activeProvider && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!!busy}
                        onClick={() =>
                          void run(offer.id, () =>
                            actions.createOffer(offerInputSchema.parse(offer)),
                          )
                        }
                      >
                        {t("copyOffer", {
                          provider:
                            data.activeProvider === "stripe"
                              ? "Stripe"
                              : "Adyen",
                        })}
                      </Button>
                    )}
                  {offer.editable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!!busy}
                      onClick={() => {
                        setEditing(offer);
                        setShowForm(true);
                      }}
                    >
                      {t("editDraft")}
                    </Button>
                  )}
                  <Button asChild variant="ghost" size="sm">
                    <a
                      href={`/${locale}/communities/${encodeURIComponent(slug)}/offers/${offer.id}`}
                    >
                      {t("viewOffer")}
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      !!busy ||
                      (!offer.published &&
                        offer.provider !== data.activeProvider)
                    }
                    onClick={() =>
                      void run(offer.id, () =>
                        actions.publishOffer(offer.id, !offer.published),
                      )
                    }
                  >
                    {t(offer.published ? "unpublish" : "publish")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="border-border border-t pt-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={data.paidEntry}
              disabled={
                !!busy ||
                (!data.paidEntry &&
                  !data.offers.some(
                    (offer) => offer.kind === "membership" && offer.published,
                  ))
              }
              onChange={(event) =>
                void run("entry", () => actions.paidEntry(event.target.checked))
              }
              className="accent-primary mt-1 size-4"
            />
            <span>
              <span className="text-sm font-medium">{t("paidEntry")}</span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {t("paidEntryHelp")}
              </span>
            </span>
          </label>
        </div>
      </section>
      <section aria-labelledby="sales-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="sales-heading" className="text-lg font-semibold">
              {t("sales")}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("salesTotals", {
                gross: currency(collected),
                refunded: currency(refunded),
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="sales-filter">
              {t("filter")}
            </label>
            <select
              id="sales-filter"
              className="border-input bg-background h-10 rounded-md border px-3 text-sm"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              {["all", "donation", "event", "course", "membership"].map(
                (kind) => (
                  <option key={kind} value={kind}>
                    {t(kind)}
                  </option>
                ),
              )}
            </select>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/payments/export?slug=${encodeURIComponent(slug)}`}>
                {t("export")}
              </a>
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">{t("totalsHelp")}</p>
        {!transactions.length ? (
          <p className="text-muted-foreground border-border border-y py-8 text-sm">
            {t("emptySales")}
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {transactions.map((order) => (
              <li key={order.id} className="space-y-3 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{order.title}</p>
                    <p className="text-muted-foreground mt-1 text-sm break-all">
                      {order.buyerEmail}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      }).format(order.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm tabular-nums">
                      {formatPaymentAmount(
                        order.amount,
                        locale,
                        order.currency,
                      )}
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {t(order.status)}
                    </p>
                    {order.fulfillment === "refund_required" && (
                      <p className="text-destructive mt-1 text-sm">
                        {t("refundRequired")}
                      </p>
                    )}
                  </div>
                </div>
                {order.status === "paid" && (
                  <div className="flex flex-wrap items-center gap-2">
                    {confirmRefund === order.id ? (
                      <>
                        <span className="text-sm">{t("confirmRefund")}</span>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={!!busy}
                          onClick={() =>
                            void run(order.id, async () => {
                              await actions.refund(order.id);
                              setConfirmRefund(null);
                            })
                          }
                        >
                          {t("refund")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmRefund(null)}
                        >
                          {t("close")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!!busy}
                        onClick={() => setConfirmRefund(order.id)}
                      >
                        {t("refund")}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {!!data.complimentaryMembers.length && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            {t(
              data.paidEntry ? "complimentaryMembers" : "complimentaryPreview",
            )}
          </h2>
          <ul className="space-y-2">
            {data.complimentaryMembers.map((member) => (
              <li key={member.email} className="text-sm">
                <span className="font-medium">{member.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {member.email} · {t("complimentary")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="subscriptions-heading" className="space-y-3">
        <h2 id="subscriptions-heading" className="text-lg font-semibold">
          {t("subscriptions")}
        </h2>
        {!data.subscriptions.length ? (
          <p className="text-muted-foreground text-sm">
            {t("emptySubscriptions")}
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {data.subscriptions.map((subscription) => (
              <li
                key={subscription.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <p className="font-medium">{subscription.title}</p>
                  <p className="text-muted-foreground mt-1 text-sm break-all">
                    {subscription.buyerEmail} · {t(subscription.status)}
                  </p>
                  <SubscriptionAccessNotice subscription={subscription} />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !!busy ||
                    subscription.cancelAtPeriodEnd ||
                    subscription.status === "canceled"
                  }
                  onClick={() =>
                    void run(subscription.id, () =>
                      actions.cancel(subscription.id),
                    )
                  }
                >
                  {t(
                    subscription.cancelAtPeriodEnd
                      ? "cancellationScheduled"
                      : "cancelSubscription",
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function OfferForm({
  resources,
  busy,
  onSubmit,
  initial,
}: {
  resources: PaymentsSnapshot["resources"];
  busy: boolean;
  onSubmit: (offer: OfferInput) => Promise<void>;
  initial?: OfferInput;
}) {
  const t = useTranslations("payments");
  const [kind, setKind] = useState<OfferKind>(initial?.kind ?? "donation");
  const [interval, setInterval] = useState<BillingInterval>(
    initial?.interval ?? "once",
  );
  const [error, setError] = useState(false);
  return (
    <form
      className="bg-muted/30 border-border space-y-4 rounded-xl border p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const enteredAmount = values.get("amount");
        const parsed = offerInputSchema.safeParse({
          kind,
          interval,
          title: values.get("title"),
          description: values.get("description"),
          amount: parsePaymentAmount(
            typeof enteredAmount === "string" ? enteredAmount : "",
          ),
          resourceId: ["event", "course"].includes(kind)
            ? Number(values.get("resourceId"))
            : null,
        });
        setError(!parsed.success);
        if (parsed.success) void onSubmit(parsed.data);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="offer-kind">{t("offerType")}</Label>
          <select
            id="offer-kind"
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            value={kind}
            onChange={(event) => {
              const next = event.target.value as OfferKind;
              setKind(next);
              setInterval(next === "membership" ? "month" : "once");
            }}
          >
            {["donation", "event", "course", "membership"].map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="offer-interval">{t("billingInterval")}</Label>
          <select
            id="offer-interval"
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            value={interval}
            onChange={(event) =>
              setInterval(event.target.value as BillingInterval)
            }
          >
            {(kind === "membership"
              ? ["month", "year"]
              : kind === "donation"
                ? ["once", "month", "year"]
                : ["once"]
            ).map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="offer-title">{t("offerName")}</Label>
        <Input
          id="offer-title"
          name="title"
          required
          maxLength={120}
          defaultValue={initial?.title}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="offer-description">{t("description")}</Label>
        <Textarea
          id="offer-description"
          name="description"
          maxLength={2000}
          defaultValue={initial?.description}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="offer-amount">{t("priceEUR")}</Label>
        <Input
          id="offer-amount"
          name="amount"
          inputMode="decimal"
          required
          placeholder="10.00"
          defaultValue={initial ? (initial.amount / 100).toFixed(2) : undefined}
          className="max-w-48"
        />
        <p className="text-muted-foreground text-xs">{t("priceHelp")}</p>
      </div>
      {["event", "course"].includes(kind) && (
        <div className="space-y-2">
          <Label htmlFor="offer-resource">{t("resource")}</Label>
          <select
            id="offer-resource"
            name="resourceId"
            defaultValue={initial?.resourceId ?? ""}
            required
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
          >
            <option value="">{t("chooseResource")}</option>
            {resources
              .filter((resource) => resource.kind === kind)
              .map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.title}
                </option>
              ))}
          </select>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t("invalidOffer")}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy && (
          <Loader2
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        {t("saveDraft")}
      </Button>
    </form>
  );
}
