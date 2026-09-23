import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { StartupsJobsBoard } from "@/components/investigations/startups-jobs-board";
import type { StartupRolePublic } from "@/lib/investigations/startup-roles";
import { getSession } from "@/server/better-auth/server";
import { listMyCommunities } from "@/server/communities/my-communities";
import { db } from "@/server/db";
import { listPublicStartupRoles } from "@/server/startups/queries";

export const dynamic = "force-dynamic";

function rolesForBoard(
  roles: readonly StartupRolePublic[],
): StartupRolePublic[] {
  const picked: StartupRolePublic[] = [];
  const seen = new Set<string>();
  for (const role of roles) {
    if (seen.has(role.startupSlug)) continue;
    seen.add(role.startupSlug);
    picked.push(role);
    if (picked.length >= 8) break;
  }
  return picked;
}

export default async function DashboardJobsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  const locale = await getLocale();
  const [roles, memberships] = await Promise.all([
    listPublicStartupRoles(),
    listMyCommunities(db, session.user.id),
  ]);
  const communities = memberships
    .filter((membership) => membership.status === "active")
    .map((membership) => ({
      slug: membership.slug,
      name: membership.name,
    }));

  return (
    <StartupsJobsBoard
      locale={locale}
      roles={rolesForBoard(roles)}
      communities={communities}
    />
  );
}
