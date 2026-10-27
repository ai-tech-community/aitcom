import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/messages";
import { magazineSettingsPath } from "@/lib/magazines/paths";

export default async function MagazineSettingsPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  redirect({ href: magazineSettingsPath(slug), locale: resolveLocale(locale) });
}
