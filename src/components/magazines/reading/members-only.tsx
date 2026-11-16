import { BookLock } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { PageNotice } from "@/components/ui/page-notice";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/messages";

export async function MagazineMembersOnly({
  locale,
  communitySlug,
  signedIn,
  returnPath,
}: {
  locale: AppLocale;
  communitySlug: string;
  signedIn: boolean;
  returnPath: string;
}) {
  const t = await getTranslations({ locale, namespace: "magazines.access" });
  return (
    <PageNotice
      symbol={<BookLock className="size-16 stroke-1 sm:size-24" />}
      title={t("membersOnlyTitle")}
      description={t(signedIn ? "memberDescription" : "guestDescription")}
    >
      {!signedIn && (
        <Button asChild size="lg" className="h-auto min-h-11 whitespace-normal">
          <Link
            href={{ pathname: "/auth/signin", query: { redirect: returnPath } }}
          >
            {t("signIn")}
          </Link>
        </Button>
      )}
      <Button
        asChild
        variant={signedIn ? "default" : "outline"}
        size="lg"
        className="h-auto min-h-11 whitespace-normal"
      >
        <Link href={`/communities/${communitySlug}`}>{t("viewCommunity")}</Link>
      </Button>
      <Button
        asChild
        variant="ghost"
        size="lg"
        className="h-auto min-h-11 whitespace-normal"
      >
        <Link href="/magazines">{t("browseMagazines")}</Link>
      </Button>
    </PageNotice>
  );
}
