/**
 * Backfill script for historical event enrichment.
 *
 * Enriches existing activity events with personality labels and context types,
 * then populates the aggregate tables for all historical dates.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-impact-metadata.ts
 */

import { eq, and, sql, asc } from "drizzle-orm";

import { db } from "@/server/db";
import { activityEvents, challengeEnrollments } from "@/server/db/schema";
import { classifyPersonality, deriveContextType } from "@/lib/impact-metrics";

const BATCH_SIZE = 500;

export async function backfill() {
  // -----------------------------------------------------------------------
  // 1. Count total events
  // -----------------------------------------------------------------------
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activityEvents);
  const totalEvents = countRow?.count ?? 0;

  if (totalEvents === 0) {
    console.log("No activity events found. Nothing to backfill.");
    return;
  }

  console.log(`Starting backfill of ${totalEvents} activity events...`);

  // -----------------------------------------------------------------------
  // 2. Process events in batches
  // -----------------------------------------------------------------------
  let processed = 0;
  let offset = 0;

  while (offset < totalEvents) {
    const batch = await db
      .select({
        id: activityEvents.id,
        actorId: activityEvents.actorId,
        action: activityEvents.action,
        targetId: activityEvents.targetId,
        metadata: activityEvents.metadata,
        collabSessionId: activityEvents.collabSessionId,
        contextType: activityEvents.contextType,
      })
      .from(activityEvents)
      .orderBy(asc(activityEvents.createdAt))
      .limit(BATCH_SIZE)
      .offset(offset);

    if (batch.length === 0) break;

    // -------------------------------------------------------------------
    // 2a. Collect challenge enrollment lookups needed for this batch
    // -------------------------------------------------------------------
    const challengeLookups = new Map<
      string,
      { actorId: string; challengeId: string }
    >();

    for (const event of batch) {
      if (
        event.action.startsWith("challenge.") &&
        event.targetId &&
        !event.collabSessionId
      ) {
        const key = `${event.actorId}|${event.targetId}`;
        if (!challengeLookups.has(key)) {
          challengeLookups.set(key, {
            actorId: event.actorId,
            challengeId: event.targetId,
          });
        }
      }
    }

    // Batch-query enrollment progressLogThreadIds for challenge events
    const enrollmentMap = new Map<string, string | null>();

    if (challengeLookups.size > 0) {
      const lookupEntries = [...challengeLookups.values()];

      // Build OR conditions for each (userId, challengeId) pair
      const conditions = lookupEntries.map(
        ({ actorId, challengeId }) =>
          and(
            eq(challengeEnrollments.userId, actorId),
            eq(challengeEnrollments.challengeId, Number(challengeId)),
          )!,
      );

      // Query in chunks if there are many unique pairs (avoid excessively long queries)
      const LOOKUP_CHUNK_SIZE = 100;
      for (let i = 0; i < conditions.length; i += LOOKUP_CHUNK_SIZE) {
        const chunk = conditions.slice(i, i + LOOKUP_CHUNK_SIZE);
        const whereClause =
          chunk.length === 1 ? chunk[0]! : sql`(${sql.join(chunk, sql` OR `)})`;

        const enrollments = await db
          .select({
            userId: challengeEnrollments.userId,
            challengeId: challengeEnrollments.challengeId,
            progressLogThreadId: challengeEnrollments.progressLogThreadId,
          })
          .from(challengeEnrollments)
          .where(whereClause);

        for (const enrollment of enrollments) {
          const key = `${enrollment.userId}|${String(enrollment.challengeId)}`;
          enrollmentMap.set(key, enrollment.progressLogThreadId);
        }
      }
    }

    // -------------------------------------------------------------------
    // 2b. Update each event in the batch
    // -------------------------------------------------------------------
    for (const event of batch) {
      const personalityLabel = classifyPersonality(event.action);
      const contextType = deriveContextType(event.action);

      // Merge personalityLabel into existing metadata
      const updatedMetadata: Record<string, unknown> = {
        ...(event.metadata ?? {}),
      };
      if (personalityLabel) {
        updatedMetadata.personalityLabel = personalityLabel;
      }

      // Determine collabSessionId
      let collabSessionId = event.collabSessionId;

      if (!collabSessionId) {
        if (event.action.startsWith("challenge.") && event.targetId) {
          // Look up from enrollment progressLogThreadId
          const key = `${event.actorId}|${event.targetId}`;
          const threadId = enrollmentMap.get(key);
          if (threadId) {
            collabSessionId = threadId;
          }
        } else if (
          (event.action.startsWith("thread.") ||
            event.action.startsWith("knowledge.")) &&
          event.targetId
        ) {
          // Forum events: use targetId (thread ID) as collabSessionId
          collabSessionId = event.targetId;
        }
      }

      // Build update payload — only include fields that changed
      const updates: {
        metadata?: Record<string, unknown>;
        contextType?: string | null;
        collabSessionId?: string | null;
      } = {};

      // Always update metadata if personalityLabel was added
      if (personalityLabel) {
        updates.metadata = updatedMetadata;
      }

      // Update contextType if it was not already set
      if (contextType && !event.contextType) {
        updates.contextType = contextType;
      }

      // Update collabSessionId if it changed
      if (collabSessionId && collabSessionId !== event.collabSessionId) {
        updates.collabSessionId = collabSessionId;
      }

      // Only issue an UPDATE if something actually changed
      if (Object.keys(updates).length > 0) {
        await db
          .update(activityEvents)
          .set(updates)
          .where(eq(activityEvents.id, event.id));
      }
    }

    processed += batch.length;
    offset += BATCH_SIZE;
    console.log(`Backfilled ${processed} / ${totalEvents} events`);
  }

  console.log(`\nMetadata backfill complete. ${processed} events processed.`);

  // -----------------------------------------------------------------------
  // 3. Aggregate tables population
  // -----------------------------------------------------------------------
  // Collect all distinct dates from activity events
  const distinctDates = await db
    .select({
      date: sql<string>`DISTINCT DATE(${activityEvents.createdAt})`,
    })
    .from(activityEvents)
    .orderBy(asc(sql`DATE(${activityEvents.createdAt})`));

  console.log(
    `\nFound ${distinctDates.length} distinct date(s) requiring aggregation.`,
  );

  // TODO: Run impact-aggregation cron for each historical date after deployment
  // The aggregation cron at src/app/api/cron/impact-aggregation/route.ts requires
  // the Payload CMS context (getPayloadClient) which is not available in a
  // standalone script. After deploying this backfill, trigger the aggregation
  // cron for each historical date to populate daily_core_metrics,
  // daily_collab_mix, and daily_experimental_metrics tables.
  console.log(
    "Skipping aggregate table population (requires Payload CMS context).",
  );
  console.log(
    "Run the impact-aggregation cron for each historical date after deployment.",
  );
}

backfill().catch(console.error);
