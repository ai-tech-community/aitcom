import type { AppLocale } from "@/i18n/messages";
import { buttonVariants } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import { NOTIFICATION_SETTINGS_HREF } from "@/lib/dashboard-routes";

export type UnsubscribeCopy = {
  kicker: string;
  title: string;
  body: string;
  action: string;
  doneTitle: string;
  doneBody: string;
  invalidTitle: string;
  invalidBody: string;
  settings?: string;
};

/** Confirm page for an unsubscribe link. The POST, not this render, opts out. */
export function UnsubscribeConfirm({
  status,
  token,
  locale,
  copy,
}: {
  status: "ready" | "done" | "invalid";
  token?: string;
  locale: AppLocale;
  copy: UnsubscribeCopy;
}) {
  const title =
    status === "done"
      ? copy.doneTitle
      : status === "ready"
        ? copy.title
        : copy.invalidTitle;
  const body =
    status === "done"
      ? copy.doneBody
      : status === "ready"
        ? copy.body
        : copy.invalidBody;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-16">
      <SectionLabel as="p">{copy.kicker}</SectionLabel>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-balance">
        {title}
      </h1>
      <div className="border-border mt-6 rounded-lg border p-6">
        <p
          className="text-sm text-pretty"
          role={status === "done" ? "status" : undefined}
        >
          {body}
        </p>
        {status === "ready" && token ? (
          <form method="post" action="/api/email/unsubscribe" className="mt-6">
            <input type="hidden" name="t" value={token} />
            <input type="hidden" name="confirm" value="unsubscribe" />
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className={buttonVariants()}>
              {copy.action}
            </button>
          </form>
        ) : null}
        {copy.settings ? (
          <p className="mt-6 text-sm">
            <Link
              href={NOTIFICATION_SETTINGS_HREF}
              className="underline underline-offset-4"
            >
              {copy.settings}
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
