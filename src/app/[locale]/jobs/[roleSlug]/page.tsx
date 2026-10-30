import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { StartupsRolePage } from "@/components/investigations/startups-role-page";
import { openJobRobots } from "@/lib/investigations/job-indexability";
import { buildStartupRolePath } from "@/lib/investigations/startups";
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
  const t = await getTranslations("investigationsStartups");
  const role = await findPublicStartupRoleBySlug(roleSlug);
  if (!role) {
    return { title: t("roleNotFound") };
  }
  const title = `${role.title} — ${role.startupName}`;
  const description = role.location
    ? t("roleMeta", {
        title: role.title,
        startup: role.startupName,
        location: role.location,
      })
    : t("roleMetaNoPlace", {
        title: role.title,
        startup: role.startupName,
      });
  return {
    title,
    description,
    robots: openJobRobots({
      ...role,
      descriptionAlreadySanitized: true,
    }),
    ...buildOgMeta(title, description, t("kicker")),
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
