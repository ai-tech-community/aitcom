import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SubscriptionConfirm } from "@/components/magazines/reading/subscription-confirm";
import { resolveLocale } from "@/i18n/messages";
import { db } from "@/server/db";
import {
  readConfirmLink,
  type ConfirmLink,
} from "@/server/magazines/subscriptions/service";
import { getPayloadClient } from "@/server/payload";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("magazineSubscription");
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function SubscriptionConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { locale: rawLocale } = await params;
  const query = await searchParams;
  const token = (Array.isArray(query.t) ? query.t[0] : query.t) ?? "";
  const link: ConfirmLink = token
    ? await readConfirmLink(
        { db, payload: await getPayloadClient() },
        token,
        new Date(),
      )
    : { status: "invalid", magazine: null };

  return (
    <SubscriptionConfirm
      status={link.status}
      magazine={link.magazine}
      token={token}
      locale={resolveLocale(rawLocale)}
    />
  );
}
