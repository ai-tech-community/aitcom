import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { StartupsProfilePage } from "@/components/investigations/startups-profile";
import {
  buildStartupProfilePath,
  parseStartupSlug,
  startupProfileMetaDescription,
  startupsPublicRobots,
  type StartupLocale,
} from "@/lib/investigations/startups";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import {
  shouldPromoteJoin,
  toHubAuthUser,
} from "@/server/better-auth/hub-session";
import { getSession } from "@/server/better-auth/server";
import { findApprovedPublicStartupBySlug, listOpenStartupRolesForCompany } from "@/server/startups/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseStartupSlug(slug);
  const card = parsed ? await findApprovedPublicStartupBySlug(parsed) : null;
  if (!card) {
    return { title: "Startup not found" };
  }
  const locale = await getLocale();
  const copyLocale: StartupLocale = locale === "nl" ? "nl" : "en";
  const description = startupProfileMetaDescription(card, copyLocale);
  return {
    title: card.name,
    ...(description ? { description } : {}),
    robots: startupsPublicRobots(),
    ...(description
      ? buildOgMeta(card.name, description, "Investigation")
      : {}),
    alternates: await localeAlternates(buildStartupProfilePath(card.slug)),
  };
}

export default async function StartupProfileRoute({ params }: PageProps) {
  const { slug } = await params;
  const parsed = parseStartupSlug(slug);
  const card = parsed ? await findApprovedPublicStartupBySlug(parsed) : null;
  if (!card) notFound();

  const locale = await getLocale();
  const t = await getTranslations("investigationsStartups");
  const session = await getSession();
  const roles = await listOpenStartupRolesForCompany(card.id);

  return (
    <StartupsProfilePage
      locale={locale}
      t={t}
      card={card}
      roles={roles}
      promoteJoin={shouldPromoteJoin(toHubAuthUser(session?.user))}
    />
  );
}
