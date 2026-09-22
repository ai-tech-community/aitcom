import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { StartupsJobsBoard } from "@/components/investigations/startups-jobs-board";
import {
  listPublicStartupRoles,
  listListedCommunities,
} from "@/server/startups/queries";
import type { StartupRolePublic } from "@/lib/investigations/startup-roles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your board",
  robots: { index: false, follow: false },
};

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

export default async function JobsBoardPrototypePage() {
  const locale = await getLocale();
  const [roles, communities] = await Promise.all([
    listPublicStartupRoles(),
    listListedCommunities(),
  ]);

  return (
    <StartupsJobsBoard
      locale={locale}
      roles={rolesForBoard(roles)}
      communities={communities}
    />
  );
}
