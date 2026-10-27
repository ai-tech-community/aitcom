"use client";

import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveLocale } from "@/i18n/messages";
import { Link, usePathname } from "@/i18n/navigation";
import { SUBSCRIBER_EMAIL_MAX } from "@/lib/magazines/subscriptions";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

/** Account subscriptions go to the inbox; guests can ask for an email link. */
export function SubscribeButton({
  magazineSlug,
  magazineName,
  className,
}: {
  magazineSlug: string;
  magazineName: string;
  className?: string;
}) {
  const t = useTranslations("magazines.subscribe");
  const locale = resolveLocale(useLocale());
  const pathname = usePathname();
  const utils = api.useUtils();
  const status = api.magazineSubscriptions.status.useQuery({ magazineSlug });
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<"tooMany" | "failed" | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const emailId = useId();
  const helpId = useId();
  const errorId = useId();

  const onError = (error: { data?: { code: string } | null }) => {
    setError(error.data?.code === "TOO_MANY_REQUESTS" ? "tooMany" : "failed");
  };
  const subscribe = api.magazineSubscriptions.subscribe.useMutation({
    onSuccess: () => {
      void utils.magazineSubscriptions.status.invalidate({ magazineSlug });
      setAnnouncement(t("subscribedNow", { magazine: magazineName }));
    },
    onError,
  });
  const unsubscribe = api.magazineSubscriptions.unsubscribe.useMutation({
    onSuccess: () => {
      void utils.magazineSubscriptions.status.invalidate({ magazineSlug });
      setAnnouncement(t("unsubscribedNow", { magazine: magazineName }));
    },
    onError,
  });
  const subscribeByEmail =
    api.magazineSubscriptions.subscribeByEmail.useMutation({
      onSuccess: () => setEmailSent(true),
      onError,
    });

  useEffect(() => {
    if (emailOpen) emailRef.current?.focus();
  }, [emailOpen]);

  if (status.isLoading) {
    return (
      <Skeleton className={cn("h-8 w-24", className)} aria-hidden="true" />
    );
  }
  // Subscribing is supplementary: a failed status check must not break reading.
  if (status.isError || !status.data) return null;

  const pending = subscribe.isPending || unsubscribe.isPending;
  const wrapper = cn(
    "flex min-w-0 max-w-sm flex-col items-start gap-2 text-sm",
    className,
  );

  if (status.data.signedIn) {
    return (
      <div className={wrapper}>
        {status.data.subscribed ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled>
              <Check aria-hidden="true" />
              {t("subscribed")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                setAnnouncement("");
                unsubscribe.mutate({ magazineSlug });
              }}
            >
              {t("unsubscribe")}
            </Button>
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant="ink"
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                setAnnouncement("");
                subscribe.mutate({ magazineSlug, locale });
              }}
            >
              {t("subscribe")}
            </Button>
            <p className="text-muted-foreground">{t("inboxHelp")}</p>
          </>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {t(error)}
          </p>
        )}
        <p role="status" className="sr-only">
          {announcement}
        </p>
      </div>
    );
  }

  if (emailSent) {
    return (
      <p role="status" className={wrapper}>
        {t("emailSent")}
      </p>
    );
  }

  return (
    <div className={wrapper}>
      <Button
        type="button"
        variant="ink"
        size="sm"
        aria-expanded={emailOpen}
        aria-controls={formId}
        disabled={subscribeByEmail.isPending}
        onClick={() => setEmailOpen((open) => !open)}
      >
        {t("subscribe")}
      </Button>
      <div id={formId} hidden={!emailOpen} className="w-full min-w-0">
        <form
          className="flex min-w-0 flex-col items-start gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (subscribeByEmail.isPending) return;
            setError(null);
            subscribeByEmail.mutate({ magazineSlug, email, locale });
          }}
        >
          <Label htmlFor={emailId}>{t("emailLabel")}</Label>
          <Input
            ref={emailRef}
            id={emailId}
            type="email"
            autoComplete="email"
            required
            maxLength={SUBSCRIBER_EMAIL_MAX}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={error ? `${helpId} ${errorId}` : helpId}
            aria-invalid={error ? "true" : undefined}
          />
          <p id={helpId} className="text-muted-foreground">
            {t("emailHelp")}
          </p>
          {error && (
            <p id={errorId} role="alert" className="text-destructive">
              {t(error)}
            </p>
          )}
          <Button
            type="submit"
            variant="ink"
            size="sm"
            disabled={subscribeByEmail.isPending}
          >
            {t("emailSubmit")}
          </Button>
          <Link
            href={`/auth/signin?redirect=/${locale}${pathname}`}
            className="underline underline-offset-4"
          >
            {t("signInInstead")}
          </Link>
        </form>
      </div>
    </div>
  );
}
