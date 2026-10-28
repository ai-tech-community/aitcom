import { sql } from "drizzle-orm";

import type { MagazineJoinSource } from "@/lib/communities/join-source";
import type { JoinSourceEntry } from "@/server/communities/join-sources";
import { activityEvents } from "@/server/db/schema";

import type { Deps } from "./deps";
import { loadIssueFactsById } from "./issue-access";

export type IssueOrigin = {
  issueId: number;
  magazineId: number;
  communityId: string;
  published: boolean;
};

/** A projection of the shared facts reader, without resolving viewer access. */
export async function issueOrigin(
  deps: Pick<Deps, "payload">,
  issueId: number,
): Promise<IssueOrigin | null> {
  const issue = await loadIssueFactsById(deps, issueId);
  if (!issue?.magazineId) return null;
  return {
    issueId: issue.id,
    magazineId: Number(issue.magazineId),
    communityId: issue.communityId,
    published: issue.status === "published",
  };
}

/** Magazine-specific verification and its paired activity writer/reader. */
export const magazineJoinSource: JoinSourceEntry<MagazineJoinSource> = {
  verify: verifyMagazineJoinSource,
  metadata: (source) => ({
    via: source.via,
    magazineId: source.magazineId,
    issueId: source.issueId,
  }),
  condition: (source) =>
    sql`(${activityEvents.metadata}->>'via' = ${source.via} AND ${activityEvents.metadata}->>'issueId' = ${String(source.issueId)})`,
};

/** Only a published issue of this community and magazine can bring a join. */
export async function verifyMagazineJoinSource(
  deps: Deps,
  communityId: string,
  source: MagazineJoinSource,
): Promise<MagazineJoinSource | null> {
  const origin = await issueOrigin(deps, source.issueId);
  return origin?.published &&
    origin.communityId === communityId &&
    origin.magazineId === source.magazineId
    ? source
    : null;
}
