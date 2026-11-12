"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatPaymentAmount,
  parsePaymentAmount,
  type OfferInput,
} from "@/lib/payments";

export function OfferPurchaseView({
  offer,
  signedIn,
  admitted,
  membershipExists,
  slug,
  eventSlug,
  courseSlug,
  purchased = false,
  busy = false,
  onCheckout,
}: {
  offer: OfferInput & { id: string; published: boolean };
  signedIn: boolean;
  admitted: boolean;
  membershipExists?: boolean;
  slug: string;
  eventSlug?: string | null;
  courseSlug?: string | null;
  purchased?: boolean;
  busy?: boolean;
  onCheckout: (input: {
    email: string;
    amount?: number;
    consent: boolean;
  }) => Promise<void>;
}) {
  const t = useTranslations("payments"),
    locale = useLocale();
  const [error, setError] = useState(false);
  return (
    <section className="border-border space-y-5 border-t pt-6">
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">{t(offer.kind)}</p>
        <h2 className="text-xl font-semibold">{offer.title}</h2>
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">
          {offer.description}
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          {formatPaymentAmount(offer.amount, locale)}
          <span className="text-muted-foreground ml-1 text-sm font-normal">
            {offer.interval === "once" ? t("once") : `/ ${t(offer.interval)}`}
          </span>
        </p>
      </div>
      {!offer.published && (
        <p role="status" className="bg-muted rounded-lg px-4 py-3 text-sm">
          {t("draftPreview")}
        </p>
      )}
      {offer.kind === "donation" && (
        <p className="text-muted-foreground text-sm">{t("supportHelp")}</p>
      )}
      {purchased && courseSlug ? (
        <Button asChild>
          <a
            href={`/${locale}/communities/${encodeURIComponent(slug)}/classroom/${encodeURIComponent(courseSlug)}`}
          >
            {t("openCourse")}
          </a>
        </Button>
      ) : offer.kind === "membership" && membershipExists ? (
        <Button asChild>
          <a href={`/${locale}/my-payments`}>{t("myPayments")}</a>
        </Button>
      ) : !admitted && offer.kind !== "donation" ? (
        <p className="text-sm">{t("admissionRequired")}</p>
      ) : offer.kind === "event" && eventSlug ? (
        <Button asChild>
          <a href={`/${locale}/events/${encodeURIComponent(eventSlug)}`}>
            {t("event")}
          </a>
        </Button>
      ) : (offer.kind !== "donation" || offer.interval !== "once") &&
        !signedIn ? (
        <Button asChild>
          <a
            href={`/${locale}/auth/signin?callbackUrl=${encodeURIComponent(`/${locale}/communities/${slug}/offers/${offer.id}`)}`}
          >
            {t("signIn")}
          </a>
        </Button>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const enteredAmount = form.get("amount");
            const enteredEmail = form.get("email");
            setError(false);
            const amount =
              offer.kind === "donation" && offer.interval === "once"
                ? parsePaymentAmount(
                    typeof enteredAmount === "string" ? enteredAmount : "",
                  )
                : undefined;
            if (amount === null) {
              setError(true);
              return;
            }
            void onCheckout({
              email: typeof enteredEmail === "string" ? enteredEmail : "",
              amount,
              consent: form.get("consent") === "on",
            }).catch(() => setError(true));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`email-${offer.id}`}>{t("email")}</Label>
            <Input
              id={`email-${offer.id}`}
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          {offer.kind === "donation" && offer.interval === "once" && (
            <div className="space-y-2">
              <Label htmlFor={`amount-${offer.id}`}>{t("supportAmount")}</Label>
              <Input
                id={`amount-${offer.id}`}
                name="amount"
                defaultValue={(offer.amount / 100).toFixed(2)}
                inputMode="decimal"
                required
              />
            </div>
          )}
          {offer.interval !== "once" && (
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="consent"
                required
                className="accent-primary mt-1 size-4"
              />
              <span className="text-sm">{t("recurringConsent")}</span>
            </label>
          )}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {t("actionFailed")}
            </p>
          )}
          <Button disabled={busy || !offer.published}>{t("buy")}</Button>
          <p className="text-muted-foreground text-xs">{t("checkoutHelp")}</p>
        </form>
      )}
    </section>
  );
}
