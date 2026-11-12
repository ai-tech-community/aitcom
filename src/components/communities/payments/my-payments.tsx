"use client";
import { SubscriptionAccessNotice } from "./subscription-access-notice";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { formatPaymentAmount } from "@/lib/payments";
import { useState } from "react";

export function MyPayments() {
  const t = useTranslations("payments"),
    locale = useLocale();
  const query = api.communityPayments.mine.useQuery();
  const cancel = api.communityPayments.cancel.useMutation();
  const portal = api.communityPayments.portal.useMutation();
  const recover = api.communityPayments.recover.useMutation();
  const [error, setError] = useState(false);
  if (query.isPending) return <Spinner className="size-6" />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("myPayments")}</h1>
        <p className="text-muted-foreground text-sm">{t("billingSummary")}</p>
      </header>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t("actionFailed")}
        </p>
      )}
      {!!query.data.complimentaryCommunities.length && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("complimentaryMembers")}</h2>
          {query.data.complimentaryCommunities.map((community) => (
            <p key={community.slug} className="text-sm">
              {community.name} · {t("complimentary")}
            </p>
          ))}
        </section>
      )}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("subscriptions")}</h2>
        <p className="text-muted-foreground text-sm">{t("cancelHelp")}</p>
        {!query.data.subscriptions.length && (
          <p className="text-muted-foreground text-sm">
            {t("emptySubscriptions")}
          </p>
        )}
        {query.data.subscriptions.map((subscription) => (
          <div
            key={subscription.id}
            className="border-border flex flex-wrap items-center justify-between gap-4 border-t py-4"
          >
            <div>
              <p className="font-medium">{subscription.title}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t(subscription.status)}
              </p>
              <SubscriptionAccessNotice subscription={subscription} />
            </div>
            <div className="flex flex-wrap gap-2">
              {subscription.provider === "adyen" &&
                subscription.status === "past_due" &&
                !subscription.cancelAtPeriodEnd && (
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setError(false);
                      void recover
                        .mutateAsync({
                          subscriptionId: subscription.id,
                          locale: locale as "en",
                          consent: true,
                        })
                        .then((result) => window.location.assign(result.url))
                        .catch(() => setError(true));
                    }}
                  >
                    <label className="flex max-w-sm items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        required
                        className="accent-primary mt-1 size-4"
                      />
                      <span>{t("recoveryConsent")}</span>
                    </label>
                    <Button disabled={recover.isPending}>
                      {t("recoverPayment")}
                    </Button>
                  </form>
                )}
              {subscription.provider === "stripe" && (
                <Button
                  variant="outline"
                  disabled={portal.isPending}
                  onClick={() => {
                    setError(false);
                    void portal
                      .mutateAsync({
                        subscriptionId: subscription.id,
                        locale: locale as "en",
                      })
                      .then((result) => window.location.assign(result.url))
                      .catch(() => setError(true));
                  }}
                >
                  {t("manageBilling")}
                </Button>
              )}
              <Button
                variant="outline"
                disabled={
                  cancel.isPending ||
                  subscription.cancelAtPeriodEnd ||
                  subscription.status === "canceled"
                }
                onClick={() => {
                  setError(false);
                  void cancel
                    .mutateAsync({ subscriptionId: subscription.id })
                    .then(() => query.refetch())
                    .catch(() => setError(true));
                }}
              >
                {t(
                  subscription.cancelAtPeriodEnd
                    ? "cancellationScheduled"
                    : "cancelSubscription",
                )}
              </Button>
            </div>
          </div>
        ))}
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("sales")}</h2>
        {!query.data.orders.length && (
          <p className="text-muted-foreground text-sm">{t("noPayments")}</p>
        )}
        {query.data.orders.map((order) => (
          <div
            key={order.id}
            className="border-border flex flex-wrap justify-between gap-4 border-t py-4"
          >
            <div>
              <p className="font-medium">{order.title}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t(order.status)}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm">
                {formatPaymentAmount(order.amount, locale, order.currency)}
              </p>
              {order.receiptUrl && (
                <a
                  href={order.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm underline underline-offset-4"
                >
                  {t("manageBilling")}
                </a>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
