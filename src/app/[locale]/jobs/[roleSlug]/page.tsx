import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { StartupsRolePage } from "@/components/investigations/startups-role-page";
import {
  buildStartupRolePath,
  startupsPublicRobots,
} from "@/lib/investigations/startups";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import {
  shouldPromoteJoin,
  toHubAuthUser,
} from "@/server/better-auth/hub-session";
import { getSession } from "@/server/better-auth/server";
import { findPublicStartupRoleBySlug } from "@/server/startups/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ roleSlug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { roleSlug } = await params;
  const role = await findPublicStartupRoleBySlug(roleSlug);
  if (!role) {
    return { title: "Position not found" };
  }
  const description = role.location
    ? `${role.title} at ${role.startupName} — ${role.location}. Sourced from the company careers page.`
    : `${role.title} at ${role.startupName}. Sourced from the company careers page.`;
  return {
    title: `${role.title} — ${role.startupName}`,
    description,
    robots: startupsPublicRobots(),
    ...buildOgMeta(
      `${role.title} — ${role.startupName}`,
      description,
      "Startups",
    ),
    alternates: await localeAlternates(buildStartupRolePath(role.slug)),
  };
}

export default async function JobsRoleRoute({ params }: PageProps) {
  const { roleSlug } = await params;
  const role = await findPublicStartupRoleBySlug(roleSlug);
  if (!role) notFound();

  const locale = await getLocale();
  const t = await getTranslations("investigationsStartups");
  const session = await getSession();

  return (
    <StartupsRolePage
      locale={locale}
      t={t}
      role={role}
      promoteJoin={shouldPromoteJoin(toHubAuthUser(session?.user))}
    />
  );
}
