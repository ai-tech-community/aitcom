import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { StartupsJobsBoard } from "@/components/investigations/startups-jobs-board";
import { getSession } from "@/server/better-auth/server";
import { listMyCommunities } from "@/server/communities/my-communities";
import { db } from "@/server/db";
import { listMyTrackedStartupRoles } from "@/server/startups/member-jobs";

export const dynamic = "force-dynamic";

export default async function DashboardJobsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  const locale = await getLocale();
  const [tracked, memberships] = await Promise.all([
    listMyTrackedStartupRoles(session.user.id),
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
      tracked={tracked}
      communities={communities}
    />
  );
}
