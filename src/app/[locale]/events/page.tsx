import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { PublicEventsPage } from "@/components/events/public-events-page";
import {
  PUBLIC_EVENTS_H1,
  PUBLIC_EVENTS_META,
  PUBLIC_EVENTS_PATH,
} from "@/lib/events/public-events";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import {
  shouldPromoteJoin,
  toHubAuthUser,
} from "@/server/better-auth/hub-session";
import { getSession } from "@/server/better-auth/server";
import { listPublicEventCards } from "@/server/events/public-events-queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: PUBLIC_EVENTS_H1,
    description: PUBLIC_EVENTS_META,
    robots: { index: true, follow: true },
    ...buildOgMeta(PUBLIC_EVENTS_H1, PUBLIC_EVENTS_META, "Events"),
    alternates: await localeAlternates(PUBLIC_EVENTS_PATH),
  };
}

export default async function EventsPage() {
  const locale = await getLocale();
  const t = await getTranslations("publicEvents");
  const events = await listPublicEventCards(locale === "nl" ? "nl" : "en");
  const session = await getSession();

  return (
    <PublicEventsPage
      locale={locale}
      t={t}
      events={events}
      promoteJoin={shouldPromoteJoin(toHubAuthUser(session?.user))}
    />
  );
}
