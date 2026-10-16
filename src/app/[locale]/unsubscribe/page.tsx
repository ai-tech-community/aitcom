import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { UnsubscribeConfirm } from "@/components/notifications/unsubscribe-confirm";
import {
  unsubscribeConfirmStatus,
  unsubscribeSecret,
  verifyUnsubscribeToken,
} from "@/server/notifications/unsubscribe-token";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("digestUnsubscribe");
  return {
    robots: { index: false, follow: false },
    title: t("metaTitle"),
  };
}

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    t?: string | string[];
    done?: string | string[];
    kind?: string | string[];
  }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale === "nl" ? "nl" : "en";
  const query = await searchParams;
  const done = query.done === "1" || query.done?.[0] === "1";
  const rawToken = Array.isArray(query.t) ? query.t[0] : query.t;
  const kindParam = Array.isArray(query.kind) ? query.kind[0] : query.kind;
  const secret = unsubscribeSecret();
  const verified =
    rawToken && secret ? verifyUnsubscribeToken(rawToken, secret) : null;
  const story = verified?.scope === "story" || (done && kindParam === "story");
  const status = unsubscribeConfirmStatus(rawToken, secret, done);

  const t = await getTranslations(
    story ? "storyUnsubscribe" : "digestUnsubscribe",
  );
  const copy = {
    kicker: t("kicker"),
    title: t("title"),
    body: t("body"),
    action: t("action"),
    doneTitle: t("doneTitle"),
    doneBody: t("doneBody"),
    invalidTitle: t("invalidTitle"),
    invalidBody: t("invalidBody"),
    settings: t("settings"),
  };

  return (
    <UnsubscribeConfirm
      status={status}
      token={status === "ready" ? rawToken : undefined}
      locale={locale}
      copy={copy}
    />
  );
}
