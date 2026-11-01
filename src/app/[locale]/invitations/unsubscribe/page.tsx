import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { referralSecret } from "@/server/communities/referral-email/config";
import { verifyReferralOptOut } from "@/server/communities/referral-email/tokens";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function UnsubscribeInvitations({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ t?: string; done?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations("referral.optout");
  let valid = false;
  try {
    valid = Boolean(verifyReferralOptOut(query.t ?? "", referralSecret()));
  } catch {
    /* Not configured: never accept an unverifiable token. */
  }
  const done = query.done === "1";
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        {t(done ? "doneTitle" : valid ? "title" : "invalidTitle")}
      </h1>
      <p className="text-muted-foreground text-base leading-relaxed">
        {t(done ? "doneBody" : valid ? "body" : "invalidBody")}
      </p>
      {valid && !done && (
        <form action="/api/referral-invites/unsubscribe" method="post">
          <input type="hidden" name="t" value={query.t} />
          <input type="hidden" name="confirm" value="unsubscribe" />
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" className="text-foreground">
            {t("confirm")}
          </Button>
        </form>
      )}
    </main>
  );
}
