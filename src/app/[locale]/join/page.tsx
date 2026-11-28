import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { HubJoin } from "@/components/join/hub-join";
import { joinPageMetadata } from "@/lib/join-page-metadata";
import { getJoinSignupHref } from "@/lib/join-path";
import { localeAlternates } from "@/lib/metadata";
import { shouldPromoteJoin } from "@/server/better-auth/hub-session";
import { loadHubAuthSeed } from "@/server/better-auth/hub-session-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("hubJoin");
  return {
    ...joinPageMetadata({
      description: t("metaDescription"),
      kicker: t("kicker"),
    }),
    alternates: await localeAlternates("/join"),
    robots: { index: true, follow: true },
  };
}

function searchFromRecord(
  record: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value != null && value !== "") {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [t, locale] = await Promise.all([
    getTranslations("hubJoin"),
    getLocale(),
  ]);
  const search = searchFromRecord(await searchParams);
  const { initialUser } = await loadHubAuthSeed();
  return (
    <HubJoin
      t={t}
      signupHref={getJoinSignupHref(search, locale)}
      promoteJoin={shouldPromoteJoin(initialUser)}
    />
  );
}
