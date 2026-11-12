"use client";

import { useLocale, useTranslations } from "next-intl";
import { hasPaidAccess, type SubscriptionSummary } from "@/lib/payments";

export function SubscriptionAccessNotice({
  subscription,
  now = new Date(),
}: {
  subscription: Pick<
    SubscriptionSummary,
    "status" | "paidThrough" | "cancelAtPeriodEnd" | "kind"
  >;
  now?: Date;
}) {
  const t = useTranslations("payments"),
    locale = useLocale();
  if (!subscription.paidThrough || subscription.status === "pending")
    return null;
  const grace =
    subscription.status === "past_due" && !subscription.cancelAtPeriodEnd;
  const deadline = new Date(
    subscription.paidThrough.getTime() + (grace ? 7 * 86400000 : 0),
  );
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(deadline);
  const key =
    subscription.kind !== "membership"
      ? "paidUntil"
      : !hasPaidAccess(subscription, now)
        ? "membershipExpired"
        : grace
          ? "graceUntil"
          : subscription.cancelAtPeriodEnd
            ? "accessUntil"
            : "paidUntil";
  return (
    <p className="text-muted-foreground mt-1 text-sm">{t(key, { date })}</p>
  );
}
