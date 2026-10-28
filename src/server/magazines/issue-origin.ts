import type { MagazineJoinSource } from "@/lib/communities/join-source";

import type { Deps } from "./deps";
import { loadIssueAccessById } from "./issue-access";

export type IssueOrigin = {
  issueId: number;
  magazineId: number;
  communityId: string;
  published: boolean;
};

/** A projection of the shared access loader; no separate issue read. */
export async function issueOrigin(
  deps: Pick<Deps, "db" | "payload">,
  issueId: number,
): Promise<IssueOrigin | null> {
  const loaded = await loadIssueAccessById(deps, issueId, null);
  if (!loaded?.issue.magazineId) return null;
  const { issue } = loaded;
  return {
    issueId: issue.id,
    magazineId: Number(issue.magazineId),
    communityId: issue.communityId,
    published: issue.status === "published",
  };
}

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
