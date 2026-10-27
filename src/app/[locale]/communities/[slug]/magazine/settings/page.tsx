import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { MagazineSettingsForm } from "@/components/magazines/editor/magazine-settings-form";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/messages";
import {
  communityMagazinePath,
  magazineSettingsPath,
} from "@/lib/magazines/paths";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { loadMagazineDesk } from "@/server/magazines/desk";
import { standingCan } from "@/server/magazines/editorship";
import { getPayloadClient } from "@/server/payload";

export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "magazineEditor.settings",
  });
  return { title: t("title"), robots: { index: false } };
}

export default async function MagazineSettingsPage({
  params,
}: {
  params: Params;
}) {
  const { locale, slug } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect(
      `/${locale}/auth/signin?redirect=/${locale}${magazineSettingsPath(slug)}`,
    );
  }
  const desk = await loadMagazineDesk(
    { db, payload: await getPayloadClient() },
    { communitySlug: slug, viewerId: session.user.id },
  );
  if (!desk || !standingCan(desk.standing, "manage")) notFound();

  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "magazineEditor.settings",
  });
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Link
        href={communityMagazinePath(slug)}
        className="text-muted-foreground w-fit text-sm underline underline-offset-4"
      >
        {t("back")}
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      </header>
      <MagazineSettingsForm slug={slug} showOpenTabLink={false} />
    </div>
  );
}
