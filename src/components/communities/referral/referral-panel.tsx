"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Check,
  CircleAlert,
  Copy,
  Globe2,
  Link2,
  Loader2,
  Mail,
  Send,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  parseReferralEmails,
  validReferralEmail,
  referralLocales,
  referralSenderFallback,
  type ReferralLocale,
} from "@/lib/referral-invites";
import { ReferralEmailPreview } from "./referral-email-preview";

export function ReferralPanel({ slug }: { slug: string }) {
  const t = useTranslations("referral");
  const pageLocale = useLocale();
  const [locale, setLocale] = useState<ReferralLocale>(
    referralLocales.includes(pageLocale as ReferralLocale)
      ? (pageLocale as ReferralLocale)
      : "en",
  );
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const requestId = useRef<string | null>(null);
  const utils = api.useUtils();
  const workspace = api.referral.workspace.useQuery(
    { slug },
    {
      refetchInterval: (query) =>
        (query.state.data?.pending ?? 0) > 0 ? 5000 : false,
    },
  );
  const myLink = api.referral.myLink.useMutation();
  const send = api.referral.sendInvites.useMutation({
    onSuccess: (data) => {
      setEmails(data.unsentEmails);
      setDraft("");
      requestId.current = null;
      void utils.referral.workspace.invalidate({ slug });
    },
    onError: () => setError(t("sendError")),
  });
  const busy = send.isPending;
  function edited() {
    setError(null);
    requestId.current = null;
    send.reset();
  }
  function collect(value = draft) {
    const next = [...new Set([...emails, ...parseReferralEmails(value)])];
    if (next.length > 10) {
      setError(t("batchLimit"));
      return null;
    }
    setEmails(next);
    setDraft("");
    return next;
  }
  function submit() {
    if (busy || !workspace.data?.canSend || workspace.data.remaining === 0)
      return;
    const next = collect();
    if (!next) return;
    if (!next.length) {
      setError(t("addEmail"));
      input.current?.focus();
      return;
    }
    if (next.some((email) => !validReferralEmail(email))) {
      setError(t("invalidEmail"));
      return;
    }
    if (next.length > (workspace.data?.remaining ?? 0)) {
      setError(t("dailyLimit"));
      return;
    }
    setError(null);
    requestId.current ??= crypto.randomUUID();
    send.mutate({ slug, emails: next, locale, requestId: requestId.current });
  }
  async function copyLink() {
    setCopied(false);
    setShareError(null);
    try {
      const link = await myLink.mutateAsync({ slug });
      const url = `${window.location.origin}/${pageLocale}/invite/${link.code}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        setShareError(t("copyFailed"));
      }
    } catch {
      setShareError(t("linkError"));
    }
  }
  if (workspace.isLoading)
    return (
      <div className="grid gap-6 lg:grid-cols-2" aria-label={t("loading")}>
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    );
  if (workspace.isError || !workspace.data)
    return (
      <ErrorState
        title={t("loadError")}
        onRetry={() => void workspace.refetch()}
      />
    );
  const data = workspace.data;
  const count = new Set([...emails, ...parseReferralEmails(draft)]).size;
  const senderName =
    (data.senderName?.trim() ?? "") || referralSenderFallback[locale];
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance">
          {t("heading")}
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {t("intro")}
        </p>
      </header>
      <div className="grid overflow-hidden rounded-xl border lg:grid-cols-2">
        <section
          className="p-6 sm:p-8"
          aria-labelledby="referral-compose-title"
        >
          <h2 id="referral-compose-title" className="text-lg font-semibold">
            {t("emailTitle")}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("emailIntro")}
          </p>
          <div className="my-6 flex items-center gap-3">
            <Users className="size-5" aria-hidden="true" />
            <div>
              <p className="text-muted-foreground text-xs">
                {t("destination")}
              </p>
              <p className="text-sm font-medium">{data.communityName}</p>
            </div>
          </div>
          {!data.canSend && (
            <p
              role="status"
              className="bg-secondary mb-5 rounded-md p-3 text-sm leading-relaxed"
            >
              {t(
                data.unavailableReason === "verification"
                  ? "verifyFirst"
                  : data.unavailableReason === "community"
                    ? "communityDisabled"
                    : "launchDisabled",
              )}
            </p>
          )}
          {data.remaining === 0 && (
            <p role="status" className="text-warning mb-5 text-sm">
              {t("dailyLimit")}
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="referral-emails" className="text-sm font-medium">
                {t("addresses")}
              </label>
              <span className="text-muted-foreground font-mono text-xs">
                {count}/10
              </span>
            </div>
            <div className="border-input bg-background focus-within:ring-ring/50 focus-within:border-ring min-h-28 rounded-md border p-3 focus-within:ring-[3px]">
              <div className="flex flex-wrap gap-2">
                {emails.map((email) => (
                  <span
                    key={email}
                    className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-xs ${validReferralEmail(email) ? "bg-secondary" : "bg-destructive/10 text-destructive"}`}
                  >
                    {!validReferralEmail(email) && (
                      <CircleAlert
                        className="size-3 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span className="break-all">{email}</span>
                    <button
                      type="button"
                      className="hover:bg-foreground/10 inline-flex size-6 shrink-0 items-center justify-center rounded-sm"
                      aria-label={t("removeEmail", { email })}
                      disabled={busy}
                      onClick={() => {
                        setEmails((all) =>
                          all.filter((value) => value !== email),
                        );
                        edited();
                      }}
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
              <input
                id="referral-emails"
                ref={input}
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={draft}
                disabled={busy || !data.canSend || data.remaining === 0}
                placeholder={t("placeholder")}
                aria-invalid={Boolean(error)}
                aria-describedby={`referral-hint${error ? " referral-error" : ""}`}
                className="placeholder:text-muted-foreground mt-1 w-full min-w-0 bg-transparent py-2 text-base outline-none md:text-sm"
                onChange={(event) => {
                  setDraft(event.target.value);
                  edited();
                }}
                onKeyDown={(event) => {
                  if (["Enter", ",", ";"].includes(event.key) && draft.trim()) {
                    event.preventDefault();
                    if (collect()) edited();
                  }
                }}
                onPaste={(event) => {
                  const text = event.clipboardData.getData("text");
                  if (/[\s,;]/.test(text)) {
                    event.preventDefault();
                    if (collect(draft + text)) edited();
                  }
                }}
              />
            </div>
            <p
              id="referral-hint"
              className="text-muted-foreground mt-2 text-xs leading-relaxed"
            >
              {t("addressHint")}
            </p>
            {error && (
              <p
                id="referral-error"
                role="alert"
                className="text-destructive mt-3 flex items-start gap-2 text-sm"
              >
                <CircleAlert
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                {error}
              </p>
            )}
            <div className="my-5 flex flex-wrap items-center justify-between gap-3">
              <label className="text-muted-foreground inline-flex items-center gap-2 text-xs">
                <Globe2 className="size-4" aria-hidden="true" />
                <span className="sr-only">{t("language")}</span>
                <select
                  value={locale}
                  disabled={busy}
                  className="bg-background rounded-sm py-1"
                  onChange={(event) => {
                    setLocale(event.target.value as ReferralLocale);
                    edited();
                  }}
                >
                  <option value="en">English</option>
                  <option value="nl">Nederlands</option>
                  <option value="fr">Français</option>
                </select>
              </label>
              <span className="text-muted-foreground font-mono text-xs">
                {t("remaining", { count: data.remaining })}
              </span>
            </div>
            <Button
              type="submit"
              disabled={busy || !data.canSend || data.remaining === 0}
              className="text-foreground min-h-10 w-full sm:w-auto"
            >
              {busy ? (
                <Loader2
                  className="size-4 motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              {busy ? t("sending") : t("send", { count })}
            </Button>
            <p className="text-muted-foreground mt-3 text-xs">
              {t("onBehalf")}
            </p>
            <p className="text-muted-foreground mt-4 flex items-center gap-2 text-xs leading-relaxed">
              <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
              {t("assurance")}
            </p>
          </form>
          <div aria-live="polite">
            {send.data && (
              <div className="bg-secondary mt-5 rounded-md p-4 text-sm leading-relaxed">
                <p className="flex items-center gap-2 font-medium">
                  <Check className="size-4" aria-hidden="true" />
                  {t("sendResult", {
                    sent: send.data.sent,
                    pending: send.data.pending,
                  })}
                </p>
                {send.data.skipped > 0 && (
                  <p className="text-muted-foreground mt-2">
                    {t("skipped", { count: send.data.skipped })}
                  </p>
                )}
                {send.data.failed > 0 && (
                  <p className="text-destructive mt-2">
                    {t("failedResult", { count: send.data.failed })}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
        <aside className="bg-muted/40 border-t p-5 sm:p-6 lg:border-t-0 lg:border-l">
          <p className="text-muted-foreground mb-4 flex items-center gap-2 font-mono text-xs">
            <Mail className="size-4" aria-hidden="true" />
            {t("preview")}
          </p>
          <ReferralEmailPreview
            senderName={senderName}
            communityName={data.communityName}
            locale={locale}
            previewLabel={t("preview")}
          />
        </aside>
      </div>
      <section className="space-y-3" aria-label={t("shareLabel")}>
        <p className="text-muted-foreground text-sm">{t("shareIntro")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link2 className="text-muted-foreground size-4" aria-hidden="true" />
          {shareUrl && (
            <input
              className="border-input min-w-0 grow rounded-md border px-3 py-2 font-mono text-xs"
              readOnly
              aria-label={t("shareLabel")}
              value={shareUrl}
              onFocus={(event) => event.target.select()}
            />
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyLink()}
            disabled={
              myLink.isPending || data.unavailableReason === "community"
            }
          >
            <Copy className="size-4" aria-hidden="true" />
            {copied ? t("copied") : t("shareCta")}
          </Button>
        </div>
        {shareError && (
          <p role="alert" className="text-destructive text-sm">
            {shareError}
          </p>
        )}
      </section>
      <section
        className="border-t pt-6"
        aria-labelledby="referral-progress-title"
      >
        <h2 id="referral-progress-title" className="text-base font-semibold">
          {t("progressTitle")}
        </h2>
        {data.sent +
          data.pending +
          data.failed +
          data.joined +
          data.activated ===
        0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title={t("progressEmpty")}
            description={t("progressEmptyBody")}
            className="items-start px-0 py-5 text-left"
          />
        ) : (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <p>{t("sentCount", { count: data.sent })}</p>
            <p>{t("joinedCount", { count: data.joined })}</p>
            <p>{t("activatedCount", { count: data.activated })}</p>
            {data.pending > 0 && (
              <p className="text-muted-foreground">
                {t("pendingCount", { count: data.pending })}
              </p>
            )}
            {data.failed > 0 && (
              <p className="text-destructive">
                {t("failedCount", { count: data.failed })}
              </p>
            )}
          </div>
        )}
        <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
          {t("xpExplanation")}
        </p>
      </section>
    </div>
  );
}
