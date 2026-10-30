import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import type { AppLocale } from "@/i18n/messages";
import { Link } from "@/i18n/navigation";
import { magazinePath } from "@/lib/magazines/paths";
import { cn } from "@/lib/utils";
import type { ConfirmLink } from "@/server/magazines/subscriptions/service";

const stateCopy = {
  ready: { title: "readyTitle", body: "readyBody" },
  subscribed: { title: "doneTitle", body: "doneBody" },
  expired: { title: "expiredTitle", body: "expiredBody" },
  invalid: { title: "invalidTitle", body: "invalidBody" },
} as const satisfies Record<
  ConfirmLink["status"],
  { title: string; body: string }
>;

/** Rendering reads the link's state; the form POST is the only confirmation. */
export function SubscriptionConfirm({
  status,
  magazine,
  token,
  locale,
}: ConfirmLink & { token: string; locale: AppLocale }) {
  const t = useTranslations("magazineSubscription");
  const copy = stateCopy[status];
  const values = { magazine: magazine?.name ?? "" };

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-16">
      <SectionLabel as="p">{t("kicker")}</SectionLabel>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-balance [overflow-wrap:anywhere]">
        {t(copy.title, values)}
      </h1>
      <div className="border-border mt-6 rounded-lg border p-6">
        <p
          className="text-sm text-pretty [overflow-wrap:anywhere]"
          role={status === "subscribed" ? "status" : undefined}
        >
          {t(copy.body, values)}
        </p>
        {status === "ready" ? (
          <form
            method="post"
            action="/api/magazine-subscriptions/confirm"
            className="mt-6"
          >
            <input type="hidden" name="t" value={token} />
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className={buttonVariants()}>
              {t("action")}
            </button>
          </form>
        ) : magazine ? (
          <Link
            href={magazinePath(magazine)}
            locale={locale}
            className={cn(
              buttonVariants({ variant: "ink" }),
              "mt-6 h-auto min-h-9 max-w-full text-center whitespace-normal",
            )}
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {t("openMagazine", values)}
            </span>
          </Link>
        ) : null}
      </div>
    </main>
  );
}
