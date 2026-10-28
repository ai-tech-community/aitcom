import type { IssueReaderAccess } from "@/lib/magazines/access";

import type { ItemReader } from "./reader";

export type CommunityContentRule = {
  readable(communityId: string | null | undefined): boolean;
  membersOnly(communityId: string | null | undefined): boolean;
};

/** Per-reader content access; public issue access never widens it. */
export async function loadCommunityContentRule(
  reader: ItemReader,
  access: IssueReaderAccess,
): Promise<CommunityContentRule> {
  switch (access) {
    case "editor": {
      const [hidden, membersOnly] = await Promise.all([
        reader.hiddenCommunityIds(),
        reader.membersOnlyCommunityIds(),
      ]);
      return {
        readable: (id) => id == null || !hidden.has(id),
        membersOnly: (id) => id != null && membersOnly.has(id),
      };
    }
    case "teaser":
    case "full": {
      const hidden = await reader.hiddenCommunityIds();
      return {
        readable: (id) => id == null || !hidden.has(id),
        membersOnly: () => false,
      };
    }
  }
}
