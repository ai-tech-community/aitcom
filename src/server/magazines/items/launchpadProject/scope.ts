import { and, eq, inArray, sql } from "drizzle-orm";
import type { Where } from "payload";

import { escapeLike } from "@/server/db/escape-like";
import { communityMemberships } from "@/server/db/schema";

import type { Deps } from "../../deps";
import type { ItemCommunity } from "../types";

type ProjectScope = { communityId?: string | null; authorId?: string | null };

/**
 * This community's projects, or unscoped projects by its active members.
 * The picker checks membership with SQL EXISTS and returns bounded project ids;
 * validation checks only the authors of its loaded project batch.
 */
export async function communityProjectWhere(
  deps: Pick<Deps, "db">,
  community: ItemCommunity,
  query: string,
  exclude: readonly number[],
  limit: number,
): Promise<Where> {
  const words = query.split(/\s+/).filter(Boolean);
  // Payload owns this table. Use its SQL identifiers here so app queries do
  // not mix Payload's Drizzle version with the app database's version.
  const { rows: memberProjects } = await deps.db.execute<{ id: number }>(sql`
    select "launchpad_projects"."id"
    from "launchpad_projects"
    where "launchpad_projects"."community_id" is null
      and "launchpad_projects"."status" = ${"published"}
      and exists (select 1 from ${communityMemberships}
        where ${communityMemberships.userId} = "launchpad_projects"."author_id"
          and ${communityMemberships.communityId} = ${community.id}
          and ${communityMemberships.status} = ${"active"})
      ${sql.join(
        words.map(
          (word) =>
            sql`and "launchpad_projects"."title" ilike ${`%${escapeLike(word)}%`}`,
        ),
        sql` `,
      )}
      ${
        exclude.length
          ? sql`and "launchpad_projects"."id" not in (${sql.join(
              exclude.map((id) => sql`${id}`),
              sql`, `,
            )})`
          : sql``
      }
    order by "launchpad_projects"."vote_count" desc limit ${limit}
  `);
  const scope: Where[] = [{ communityId: { equals: community.id } }];
  if (memberProjects.length)
    scope.push({
      and: [
        { communityId: { exists: false } },
        { id: { in: memberProjects.map((project) => Number(project.id)) } },
      ],
    });
  return { or: scope };
}

export async function activeCommunityMemberIds(
  deps: Pick<Deps, "db">,
  community: ItemCommunity,
  authorIds: readonly string[],
): Promise<string[]> {
  if (authorIds.length === 0) return [];
  const memberships = await deps.db.query.communityMemberships.findMany({
    columns: { userId: true },
    where: and(
      eq(communityMemberships.communityId, community.id),
      eq(communityMemberships.status, "active"),
      inArray(communityMemberships.userId, [...authorIds]),
    ),
  });
  return memberships.map((membership) => membership.userId);
}

export async function communityProjectFilter(
  deps: Pick<Deps, "db">,
  community: ItemCommunity,
  projects: readonly ProjectScope[],
): Promise<(project: ProjectScope) => boolean> {
  const authorIds = [
    ...new Set(
      projects.flatMap((project) =>
        project.communityId == null && project.authorId
          ? [project.authorId]
          : [],
      ),
    ),
  ];
  const members = new Set(
    await activeCommunityMemberIds(deps, community, authorIds),
  );
  return (project) =>
    project.communityId != null
      ? project.communityId === community.id
      : !!project.authorId && members.has(project.authorId);
}
