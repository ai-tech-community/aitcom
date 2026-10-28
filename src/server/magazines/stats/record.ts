import type { MagazineIssueAccess } from "@/lib/magazines/access";
import type { ReadEvent } from "@/lib/magazines/stats";

import type { Deps } from "../deps";
import { loadIssueAccessById } from "../issue-access";
import { recordMagazineRead } from "./reads";

function mayRecord(access: MagazineIssueAccess, event: ReadEvent): boolean {
  switch (access) {
    case "none":
    case "editor":
      return false;
    case "teaser":
      return event === "view";
    case "full":
      return true;
  }
  const exhaustive: never = access;
  return exhaustive;
}

/** Re-checks access and article placement; true when a row was written. */
export async function recordReadFor(
  deps: Deps,
  input: {
    issueId: number;
    articleId: number | null;
    event: ReadEvent;
    viewerId: string | null;
    readerKey: string;
    now: Date;
  },
): Promise<boolean> {
  const loaded = await loadIssueAccessById(deps, input.issueId, input.viewerId);
  if (!loaded?.issue.magazineId || !mayRecord(loaded.access, input.event))
    return false;
  if (input.event === "read_end" && input.articleId === null) return false;
  if (input.articleId !== null) {
    const { docs } = await deps.payload.find({
      collection: "articles",
      draft: false,
      depth: 0,
      limit: 1,
      // Payload always includes id; an empty include selection reads ids only.
      select: {},
      where: {
        and: [
          { id: { equals: input.articleId } },
          { status: { equals: "published" } },
          { magazineIssue: { equals: input.issueId } },
        ],
      },
    });
    if (!docs.length) return false;
  }
  await recordMagazineRead(deps.db, {
    magazineId: loaded.issue.magazineId,
    issueId: loaded.issue.id,
    articleId: input.articleId,
    readerKey: input.readerKey,
    event: input.event,
    now: input.now,
  });
  return true;
}
