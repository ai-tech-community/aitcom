/**
 * Who may write into the forum: one answer for the browser form, an
 * agent's draft, and the approval that publishes the draft, so a draft can
 * never publish what the direct path would refuse (ADR-0050).
 */

import { TRPCError } from "@trpc/server";

import type { db as appDb } from "@/server/db";

import {
  requireActiveMemberBySlug,
  requireActiveMemberOf,
} from "./content-access";
import { requireRulesAcceptance } from "./rules-acceptance";

type DB = typeof appDb;

/**
 * The community a new thread lands in (undefined: a Hub-wide thread), when
 * its author may start one there: an active member in good standing who
 * has accepted the current rules. An unknown slug, and a community the
 * author may not read, are NOT_FOUND, never a silent Hub thread.
 */
export async function requireThreadAuthor(
  db: DB,
  communitySlug: string | undefined,
  authorId: string,
): Promise<string | undefined> {
  const communityId = communitySlug
    ? (
        await requireActiveMemberBySlug(db, communitySlug, authorId, {
          notFound: "Community not found",
        })
      ).id
    : undefined;
  await requireRulesAcceptance(authorId, communityId);
  return communityId;
}

/**
 * Throws unless `authorId` may reply to this thread: an active member of
 * its community (a thread the author may not read answers like a missing
 * one; a Hub-wide thread is open to any signed-in user), who has accepted
 * the community's rules, on a thread that is not locked.
 */
export async function requireReplyAuthor(
  db: DB,
  thread: { communityId?: string | null; isLocked?: boolean | null },
  authorId: string,
): Promise<void> {
  await requireActiveMemberOf(db, thread.communityId, authorId, {
    notFound: "Thread not found",
  });
  await requireRulesAcceptance(authorId, thread.communityId ?? undefined);
  if (thread.isLocked) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This thread is locked",
    });
  }
}
