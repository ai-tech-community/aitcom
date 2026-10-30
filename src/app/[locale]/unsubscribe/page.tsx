import { resolveLocale } from "@/i18n/messages";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { UnsubscribeConfirm } from "@/components/notifications/unsubscribe-confirm";
import {
  unsubscribeConfirmStatus,
  unsubscribeSecret,
  verifyUnsubscribeToken,
  type UnsubscribeScope,
} from "@/server/notifications/unsubscribe-token";

type UnsubscribeNamespace =
  | "digestUnsubscribe"
  | "storyUnsubscribe"
  | "magazineUnsubscribe";
type UnsubscribeQuery = {
  t?: string | string[];
  done?: string | string[];
  kind?: string | string[];
};

const unsubscribeNamespaces: Record<UnsubscribeScope, UnsubscribeNamespace> = {
  digest: "digestUnsubscribe",
  story: "storyUnsubscribe",
  magazine: "magazineUnsubscribe",
};

function unsubscribeNamespaceFor(
  query: UnsubscribeQuery,
): UnsubscribeNamespace {
  const token = Array.isArray(query.t) ? query.t[0] : query.t;
  const secret = unsubscribeSecret();
  const verified =
    token && secret ? verifyUnsubscribeToken(token, secret) : null;
  if (verified) return unsubscribeNamespaces[verified.scope];
  const done = query.done === "1" || query.done?.[0] === "1";
  const kind = Array.isArray(query.kind) ? query.kind[0] : query.kind;
  return done && (kind === "story" || kind === "magazine")
    ? unsubscribeNamespaces[kind]
    : unsubscribeNamespaces.digest;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<UnsubscribeQuery>;
}): Promise<Metadata> {
  const t = await getTranslations(unsubscribeNamespaceFor(await searchParams));
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
  searchParams: Promise<UnsubscribeQuery>;
}) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const query = await searchParams;
  const done = query.done === "1" || query.done?.[0] === "1";
  const rawToken = Array.isArray(query.t) ? query.t[0] : query.t;
  const secret = unsubscribeSecret();
  const status = unsubscribeConfirmStatus(rawToken, secret, done);

  const namespace = unsubscribeNamespaceFor(query);
  const t = await getTranslations(namespace);
  const copy = {
    kicker: t("kicker"),
    title: t("title"),
    body: t("body"),
    action: t("action"),
    doneTitle: t("doneTitle"),
    doneBody: t("doneBody"),
    invalidTitle: t("invalidTitle"),
    invalidBody: t("invalidBody"),
    settings: namespace === "magazineUnsubscribe" ? undefined : t("settings"),
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
