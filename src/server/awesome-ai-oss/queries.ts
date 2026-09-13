import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  curatedPublicCards,
  type AwesomePublicCard,
} from "@/lib/investigations/awesome-ai-oss";
import { db } from "@/server/db";
import {
  awesomeAiOssProjects,
  awesomeAiOssSaves,
  awesomeAiOssVotes,
} from "@/server/db/schema";

export type AwesomeSessionState = {
  voteCounts: Record<string, number>;
  votedIds: string[];
  savedIds: string[];
};

function toPublicCard(
  row: typeof awesomeAiOssProjects.$inferSelect,
): AwesomePublicCard {
  return {
    id: row.id,
    name: row.name,
    repoUrl: row.repoUrl,
    category: row.category,
    blurb: { en: row.blurbEn, nl: row.blurbNl },
    addedOn: row.addedOn ?? row.createdAt.toISOString().slice(0, 10),
    source: row.source,
  };
}

export async function listApprovedPublicCards(): Promise<AwesomePublicCard[]> {
  try {
    const rows = await db
      .select()
      .from(awesomeAiOssProjects)
      .where(eq(awesomeAiOssProjects.status, "approved"))
      .orderBy(desc(awesomeAiOssProjects.addedOn));
    if (rows.length === 0) return curatedPublicCards();
    return rows.map(toPublicCard);
  } catch {
    return curatedPublicCards();
  }
}

export async function loadAwesomeSessionState(
  userId: string,
  projectIds: string[],
): Promise<AwesomeSessionState> {
  if (projectIds.length === 0) {
    return { voteCounts: {}, votedIds: [], savedIds: [] };
  }

  const [countRows, votedRows, savedRows] = await Promise.all([
    db
      .select({
        projectId: awesomeAiOssVotes.projectId,
        count: sql<number>`count(*)::int`,
      })
      .from(awesomeAiOssVotes)
      .where(inArray(awesomeAiOssVotes.projectId, projectIds))
      .groupBy(awesomeAiOssVotes.projectId),
    db
      .select({ projectId: awesomeAiOssVotes.projectId })
      .from(awesomeAiOssVotes)
      .where(
        and(
          eq(awesomeAiOssVotes.voterId, userId),
          inArray(awesomeAiOssVotes.projectId, projectIds),
        ),
      ),
    db
      .select({ projectId: awesomeAiOssSaves.projectId })
      .from(awesomeAiOssSaves)
      .where(
        and(
          eq(awesomeAiOssSaves.userId, userId),
          inArray(awesomeAiOssSaves.projectId, projectIds),
        ),
      ),
  ]);

  const voteCounts: Record<string, number> = {};
  for (const row of countRows) {
    voteCounts[row.projectId] = Number(row.count);
  }

  return {
    voteCounts,
    votedIds: votedRows.map((row) => row.projectId),
    savedIds: savedRows.map((row) => row.projectId),
  };
}

export async function findProjectByRepoUrl(normalizedUrl: string) {
  const [row] = await db
    .select()
    .from(awesomeAiOssProjects)
    .where(eq(awesomeAiOssProjects.repoUrl, normalizedUrl))
    .limit(1);
  return row ?? null;
}

export async function findApprovedProject(id: string) {
  const [row] = await db
    .select()
    .from(awesomeAiOssProjects)
    .where(
      and(
        eq(awesomeAiOssProjects.id, id),
        eq(awesomeAiOssProjects.status, "approved"),
      ),
    )
    .limit(1);
  return row ?? null;
}
