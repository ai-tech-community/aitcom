"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { PaymentsView, type PaymentsActions } from "./payments-view";
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { PaymentFinance } from "./payment-finance";

export function PaymentsSettings({ slug }: { slug: string }) {
  const t = useTranslations("payments");
  const query = api.communityPayments.overview.useQuery({ slug });
  const connect = api.communityPayments.connect.useMutation();
  const refresh = api.communityPayments.refresh.useMutation();
  const select = api.communityPayments.selectProvider.useMutation();
  const create = api.communityPayments.createOffer.useMutation();
  const edit = api.communityPayments.updateOffer.useMutation();
  const publish = api.communityPayments.publishOffer.useMutation();
  const refund = api.communityPayments.refund.useMutation();
  const cancel = api.communityPayments.cancel.useMutation();
  const entry = api.communityPayments.paidEntry.useMutation();
  const update = async (operation: Promise<unknown>) => {
    await operation;
    await query.refetch();
  };
  const actions: PaymentsActions = {
    connect: async (provider, country, entityType) => {
      const result = await connect.mutateAsync({
        slug,
        provider,
        country: country as "NL",
        entityType,
      });
      window.location.assign(result.url);
    },
    refresh: () => update(refresh.mutateAsync({ slug })),
    selectProvider: (provider) =>
      update(select.mutateAsync({ slug, provider })),
    createOffer: (offer) => update(create.mutateAsync({ slug, offer })),
    updateOffer: (offerId, offer) =>
      update(edit.mutateAsync({ slug, offerId, offer })),
    publishOffer: (offerId, published) =>
      update(publish.mutateAsync({ slug, offerId, published })),
    refund: (orderId) => update(refund.mutateAsync({ slug, orderId })),
    cancel: (subscriptionId) => update(cancel.mutateAsync({ subscriptionId })),
    paidEntry: (enabled) => update(entry.mutateAsync({ slug, enabled })),
  };
  if (query.isPending)
    return (
      <div role="status" className="flex justify-center py-16">
        <Spinner className="size-6" />
        <span className="sr-only">{t("title")}</span>
      </div>
    );
  if (query.isError)
    return (
      <ErrorState
        title={
          query.error.data?.code === "FORBIDDEN"
            ? t("accessDenied")
            : t("loadFailed")
        }
        onRetry={() => void query.refetch()}
      />
    );
  return (
    <div className="space-y-9">
      <PaymentsView slug={slug} data={query.data} actions={actions} />
      {query.data.activeProvider && <PaymentFinance slug={slug} />}
    </div>
  );
}
