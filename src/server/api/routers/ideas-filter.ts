import type { Where } from "payload";

import type { IdeaCategory } from "@/lib/idea-categories";

/**
 * Ideas of one community, of a set of communities (an array), or of the Hub's
 * unscoped ideas (no id).
 */
export function buildIdeasWhere(opts: {
  communityId?: string | readonly string[];
  category?: IdeaCategory;
}): Where {
  const scope: Where =
    typeof opts.communityId === "string"
      ? { communityId: { equals: opts.communityId } }
      : opts.communityId
        ? { communityId: { in: [...opts.communityId] } }
        : { communityId: { exists: false } };
  const clauses: Where[] = [scope];
  if (opts.category) {
    clauses.push({ category: { equals: opts.category } });
  }
  return clauses.length === 1 ? clauses[0]! : { and: clauses };
}
