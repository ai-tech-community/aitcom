import { eventPage } from "./collectors/event-page";
import { hackerNews } from "./collectors/hacker-news";
import { githubRepositories } from "./collectors/github-repositories";
import { z } from "zod";

import type { AnyCollector } from "./collector";
import { feedItems } from "./collectors/feed-items";
import { personioJobs } from "./collectors/personio-jobs";
import { jobBoard } from "./collectors/job-board";
import { pageList } from "./collectors/page-list";

/**
 * Every data collector, as typed data in code (ADR-0040; same approach as
 * the badge catalog, ADR-0039). Adding a collector = one file + one line.
 */
const COLLECTORS: readonly AnyCollector[] = [
  feedItems,
  pageList,
  jobBoard,
  personioJobs,
  hackerNews,
  githubRepositories,
  eventPage,
];

export function allCollectors(): readonly AnyCollector[] {
  return COLLECTORS;
}

/** The collector with this id, unless it is unknown or switched off. */
export function getCollector(
  id: string,
  disabled: ReadonlySet<string> = new Set(),
): AnyCollector | undefined {
  if (disabled.has(id)) return undefined;
  return COLLECTORS.find((c) => c.id === id);
}

/** Column order for exports, from the collector's row schema. */
export function columnsOf(collector: AnyCollector): readonly string[] | null {
  return collector.itemSchema instanceof z.ZodObject
    ? Object.keys(collector.itemSchema.shape)
    : null;
}
