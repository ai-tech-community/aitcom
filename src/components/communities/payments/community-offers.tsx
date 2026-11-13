"use client";
import { useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { useViewerSignedIn } from "@/components/communities/use-community-join";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { OfferPurchaseView } from "./offer-purchase-view";

export function CommunityOffers({
  slug,
  offerId,
  orderId,
}: {
  slug: string;
  offerId?: string;
  orderId?: string;
}) {
  const t = useTranslations("payments"),
    locale = useLocale();
  const signedIn = useViewerSignedIn();
  const query = api.communityPayments.publicOffers.useQuery({ slug });
  const status = api.communityPayments.orderStatus.useQuery(
    { orderId: orderId ?? "", offerId: offerId ?? "" },
    {
      enabled: !!orderId && !!offerId,
      refetchInterval: (query) =>
        query.state.data?.status === "pending" ? 5000 : false,
    },
  );
  const checkout = api.communityPayments.checkout.useMutation();
  const requestKeys = useRef(new Map<string, string>());
  if (query.isPending) return <Spinner className="size-6" />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  const offers = query.data.offers.filter(
    (offer) => !offerId || offer.id === offerId,
  );
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("offersTitle")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("seller", { name: query.data.name })}
        </p>
      </header>
      {orderId && (
        <section
          role="status"
          aria-live="polite"
          className="bg-muted space-y-2 rounded-xl p-5"
        >
          <h2 className="font-semibold">{t("purchaseComplete")}</h2>
          <p className="text-sm">
            {status.isError
              ? t("loadFailed")
              : status.data
                ? t(status.data.status)
                : t("pending")}
          </p>
          {status.data?.fulfillment === "refund_required" ? (
            <p className="text-destructive text-sm">{t("refundRequired")}</p>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t(
                status.data?.status === "paid"
                  ? "thankYou"
                  : status.data?.status === "refunded"
                    ? "refundComplete"
                    : "fulfillmentPending",
              )}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void status.refetch()}
          >
            {t("refresh")}
          </Button>
        </section>
      )}
      {!offers.length && (
        <p className="text-muted-foreground">{t("offerUnavailable")}</p>
      )}
      {offers.map((offer) => (
        <OfferPurchaseView
          key={offer.id}
          offer={{ ...offer, currency: "EUR" }}
          slug={slug}
          signedIn={signedIn}
          admitted={query.data.admitted}
          membershipExists={query.data.hasMembershipSubscription}
          purchased={
            status.data?.status === "paid" &&
            status.data.fulfillment === "fulfilled"
          }
          eventSlug={offer.eventSlug}
          courseSlug={offer.courseSlug}
          busy={checkout.isPending}
          onCheckout={async (input) => {
            const quote = `${offer.id}:${input.amount ?? offer.amount}`;
            let requestKey = requestKeys.current.get(quote);
            if (!requestKey) {
              requestKey = crypto.randomUUID();
              requestKeys.current.set(quote, requestKey);
            }
            const result = await checkout.mutateAsync({
              ...input,
              offerId: offer.id,
              requestKey,
              locale: locale as "en",
            });
            window.location.assign(result.url);
          }}
        />
      ))}
      <div className="flex flex-wrap gap-5 text-sm underline underline-offset-4">
        <a href={`/${locale}/communities/${encodeURIComponent(slug)}`}>
          {t("back")}
        </a>
        {signedIn && (
          <a href={`/${locale}/dashboard/payments`}>{t("myPayments")}</a>
        )}
      </div>
    </div>
  );
}
