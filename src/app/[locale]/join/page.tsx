import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { HubJoin } from "@/components/join/hub-join";
import { getJoinSignupHref } from "@/lib/join-path";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("hubJoin");
  return {
    title: t("title"),
    description: t("lead"),
    ...buildOgMeta(t("title"), t("lead"), t("kicker")),
    alternates: await localeAlternates("/join"),
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
  const t = await getTranslations("hubJoin");
  const search = searchFromRecord(await searchParams);
  return <HubJoin t={t} signupHref={getJoinSignupHref(search)} />;
}
