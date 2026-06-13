import type { Where } from "payload";

import type { IdeaCategory } from "@/lib/idea-categories";

export function buildIdeasWhere(opts: {
  communityId?: string;
  category?: IdeaCategory;
}): Where {
  const clauses: Where[] = [
    opts.communityId
      ? { communityId: { equals: opts.communityId } }
      : { communityId: { exists: false } },
  ];
  if (opts.category) {
    clauses.push({ category: { equals: opts.category } });
  }
  return clauses.length === 1 ? clauses[0]! : { and: clauses };
}
