import { hiddenContentCommunityIds } from "@/server/communities/content-visibility-queries";

import type { Deps } from "../deps";

export type ItemReader = {
  readonly viewerId: string | null;
  /** Communities whose content this viewer may not read. One query, on first use. */
  hiddenCommunityIds(): Promise<ReadonlySet<string>>;
  /**
   * Communities whose content is members-only (the anonymous hidden set).
   * Shares the hidden-set query when viewerId is null.
   */
  membersOnlyCommunityIds(): Promise<ReadonlySet<string>>;
};

/** Request-local, lazy community sets; concurrent kinds share each promise. */
export function createItemReader(
  database: Deps["db"],
  viewerId: string | null,
): ItemReader {
  let hidden: Promise<ReadonlySet<string>> | undefined;
  let membersOnly: Promise<ReadonlySet<string>> | undefined;
  const hiddenCommunityIds = () =>
    (hidden ??= hiddenContentCommunityIds(database, viewerId).then(
      (ids) => new Set(ids),
    ));

  return {
    viewerId,
    hiddenCommunityIds,
    membersOnlyCommunityIds: () =>
      viewerId === null
        ? hiddenCommunityIds()
        : (membersOnly ??= hiddenContentCommunityIds(database, null).then(
            (ids) => new Set(ids),
          )),
  };
}
