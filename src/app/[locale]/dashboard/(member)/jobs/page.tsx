import { getLocale } from "next-intl/server";

import {
  StartupsJobsBoard,
  type TrackedBoardRole,
} from "@/components/investigations/startups-jobs-board";
import type { RoleHelpRequest } from "@/lib/investigations/startup-role-help";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";
import { listMyCommunities } from "@/server/communities/my-communities";
import { db } from "@/server/db";
import { listMyTrackedStartupRoles } from "@/server/startups/member-jobs";
import { listMyRoleHelp } from "@/server/startups/role-help";

export const dynamic = "force-dynamic";

type Loaded = {
  tracked: TrackedBoardRole[];
  communities: { slug: string; name: string }[];
  help: RoleHelpRequest[];
};

async function loadBoard(userId: string): Promise<Loaded> {
  const [tracked, memberships, help] = await Promise.all([
    listMyTrackedStartupRoles(userId),
    listMyCommunities(db, userId),
    listMyRoleHelp(userId),
  ]);
  const communities = memberships
    .filter((membership) => membership.status === "active")
    .map((membership) => ({
      slug: membership.slug,
      name: membership.name,
    }));
  return { tracked, communities, help };
}

/** Job tracker tab: the main column only; the frame is the layout's. */
export default async function DashboardJobsPage() {
  const [session, locale] = await Promise.all([
    requireDashboardSession(),
    getLocale(),
  ]);
  const userId = session.user.id;

  let loaded: Loaded | null = null;
  try {
    loaded = await loadBoard(userId);
  } catch (error) {
    // A failed load is shown as an error with retry, never as an empty board.
    console.error("[dashboard/jobs] loading the job tracker failed", error);
  }

  return (
    <StartupsJobsBoard
      // The board keeps its rows in local state; a retry that succeeds
      // must start from the fresh rows.
      key={loaded ? "loaded" : "failed"}
      locale={locale}
      tracked={loaded?.tracked ?? []}
      communities={loaded?.communities ?? []}
      helpRequests={loaded?.help ?? []}
      loadFailed={loaded === null}
    />
  );
}
