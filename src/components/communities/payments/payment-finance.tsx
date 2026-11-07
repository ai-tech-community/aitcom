"use client";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { ErrorState } from "@/components/ui/error-state";

import { PaymentFinanceView } from "./payment-finance-view";

export function PaymentFinance({ slug }: { slug: string }) {
  const t = useTranslations("payments");
  const query = api.communityPayments.finance.useQuery(
    { slug },
    { staleTime: 60000 },
  );
  if (query.isError)
    return (
      <ErrorState
        title={t("financeFailed")}
        onRetry={() => void query.refetch()}
      />
    );
  if (query.isPending)
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {t("loadingFinance")}
      </p>
    );
  if (!query.data) return null;
  return <PaymentFinanceView data={query.data} />;
}
