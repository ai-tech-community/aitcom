"use client";
import { useLocale, useTranslations } from "next-intl";
import { formatPaymentAmount } from "@/lib/payments";

export interface PaymentFinanceData {
  currency: string;
  balance: number;
  available: number | null;
  payouts: { id: string; amount: number; status: string; date: Date }[];
}
const PAYOUT_STATUS: Record<string, string> = {
  paid: "payoutPaid",
  booked: "payoutPaid",
  pending: "payoutPending",
  received: "payoutPending",
  authorised: "payoutProcessing",
  authorized: "payoutProcessing",
  in_transit: "payoutProcessing",
  failed: "payoutFailed",
  refused: "payoutFailed",
  canceled: "payoutCanceled",
  cancelled: "payoutCanceled",
};

export function PaymentFinanceView({ data }: { data: PaymentFinanceData }) {
  const t = useTranslations("payments"),
    locale = useLocale();
  return (
    <section
      aria-labelledby="payouts-heading"
      className="border-border space-y-4 border-t pt-6"
    >
      <h2 id="payouts-heading" className="text-lg font-semibold">
        {t("balanceAndPayouts")}
      </h2>
      <dl className="flex flex-wrap gap-x-10 gap-y-4">
        <div>
          <dt className="text-muted-foreground text-sm">{t("balance")}</dt>
          <dd className="mt-1 font-mono tabular-nums">
            {formatPaymentAmount(data.balance, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">
            {t("availableBalance")}
          </dt>
          <dd className="mt-1 font-mono tabular-nums">
            {data.available === null
              ? t("notReported")
              : formatPaymentAmount(data.available, locale)}
          </dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-xs">{t("payoutsHelp")}</p>
      {!data.payouts.length ? (
        <p className="text-muted-foreground text-sm">{t("emptyPayouts")}</p>
      ) : (
        <ul className="divide-border divide-y">
          {data.payouts.map((payout) => (
            <li
              key={payout.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <span>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeZone: "UTC",
                }).format(payout.date)}
              </span>
              <span>{t(PAYOUT_STATUS[payout.status] ?? "payoutUnknown")}</span>
              <span className="font-mono tabular-nums">
                {formatPaymentAmount(payout.amount, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
