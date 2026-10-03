/**
 * The newest activity an agent may read, for the pull tools
 * (agent.getNotifications, agent.getBriefing). Applies the same delivery
 * policy as webhook delivery, paging newest-first so rows the owner may not
 * read never crowd out older rows they may.
 */

import { and, desc, gt, inArray, ne, or, sql } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { activityEvents } from "@/server/db/schema";

import type { ActivityEvent } from "./deliver-event";
import { EventDeliveryAudience } from "./event-delivery-audience";

type DB = typeof _db;

export interface ReadableActivityQuery {
  /** The reading agent; its own actions are left out. */
  agentId: string;
  /** The agent's owner, whose read access decides what is admitted. */
  ownerId: string;
  /** Only rows newer than this. */
  since: Date;
  /** Only these actions. */
  actions: readonly string[];
  /** Stop once this many rows are collected. */
  want: number;
  /** Extra filter applied after the policy (e.g. notification relevance). */
  accept?: (event: ActivityEvent) => boolean;
  /** Rows fetched per page. */
  pageSize: number;
  /** Upper bound on pages fetched. */
  maxPages: number;
}

export interface ReadableActivity {
  /** Admitted rows, newest first, at most `want`. */
  events: ActivityEvent[];
  /**
   * True when every row in the window was examined, so `events` holds all
   * admitted rows. False when `want` or the page bound stopped the scan.
   */
  exhausted: boolean;
}

export async function readableActivity(
  db: DB,
  q: ReadableActivityQuery,
): Promise<ReadableActivity> {
  const audience = new EventDeliveryAudience(db);
  const events: ActivityEvent[] = [];
  let lastId: string | undefined;

  for (let page = 0; page < q.maxPages; page++) {
    const rows = await db
      .select()
      .from(activityEvents)
      .where(
        and(
          gt(activityEvents.createdAt, q.since),
          inArray(activityEvents.action, [...q.actions]),
          // Leave out this agent's own actions.
          or(
            ne(activityEvents.actorId, q.agentId),
            ne(activityEvents.actorType, "agent"),
          ),
          // Keyset on (created_at, id), read from the row itself: a JS Date
          // keeps milliseconds only, created_at keeps microseconds.
          lastId
            ? sql`(${activityEvents.createdAt}, ${activityEvents.id}) < (select ${activityEvents.createdAt}, ${activityEvents.id} from ${activityEvents} where ${activityEvents.id} = ${lastId})`
            : undefined,
        ),
      )
      .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
      .limit(q.pageSize);

    const admitted = await audience.admitted(rows, q.ownerId);
    for (const event of admitted) {
      if (q.accept && !q.accept(event)) continue;
      events.push(event);
      if (events.length >= q.want) return { events, exhausted: false };
    }
    if (rows.length < q.pageSize) return { events, exhausted: true };
    lastId = rows[rows.length - 1]!.id;
  }
  return { events, exhausted: false };
}
