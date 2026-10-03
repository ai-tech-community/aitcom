/**
 * Showcase pinning (ADR-0039): the member's own writes to
 * `member_profile.showcase_badges`. The rules are in
 * `src/lib/badges/showcase.ts`; this module reads what the member holds
 * and applies them under a row lock, so two pins at once cannot exceed the
 * limit (the column's CHECK backs that up).
 */
import { and, desc, eq } from "drizzle-orm";

import type { BadgeSlug } from "@/lib/badges/catalog";
import {
  effectivePins,
  featuredBadges,
  planPin,
  planUnpin,
  type HoldersOf,
  type PinOutcome,
} from "@/lib/badges/showcase";
import { memberBadges, memberProfiles } from "@/server/db/schema";
import {
  displayableBadgeRows,
  toDisplayableBadges,
} from "@/server/members/displayable-badges";

import type { BadgeDb } from "./metrics";

/** The displayable badges a member holds, newest first. */
export async function loadHeldBadgeSlugs(
  db: BadgeDb,
  userId: string,
): Promise<BadgeSlug[]> {
  const rows = await db
    .select({
      badgeSlug: memberBadges.badgeSlug,
      earnedAt: memberBadges.earnedAt,
    })
    .from(memberBadges)
    .where(and(eq(memberBadges.userId, userId), displayableBadgeRows()))
    .orderBy(desc(memberBadges.earnedAt), memberBadges.badgeSlug);
  return toDisplayableBadges(rows).map((badge) => badge.slug);
}

export type ShowcaseWrite =
  | { ok: true; pins: BadgeSlug[] }
  | { ok: false; reason: "no_profile" | "not_held" | "full" };

async function lockPins(db: BadgeDb, userId: string) {
  const [row] = await db
    .select({ pins: memberProfiles.showcaseBadges })
    .from(memberProfiles)
    .where(eq(memberProfiles.userId, userId))
    .for("update")
    .limit(1);
  return row?.pins ?? null;
}

async function writePins(db: BadgeDb, userId: string, pins: string[]) {
  await db
    .update(memberProfiles)
    .set({ showcaseBadges: pins })
    .where(eq(memberProfiles.userId, userId));
}

/**
 * Pins a badge the member holds to their showcase. With nothing pinned yet,
 * the badges the showcase shows now (rarest, or most recent when `holders`
 * is null because rarity could not load) are kept with the new one first.
 */
export function pinShowcaseBadge(
  db: BadgeDb,
  userId: string,
  slug: string,
  holders: HoldersOf | null = null,
): Promise<ShowcaseWrite> {
  return db.transaction(async (tx) => {
    const stored = await lockPins(tx, userId);
    if (stored === null) return { ok: false, reason: "no_profile" };
    const held = await loadHeldBadgeSlugs(tx, userId);
    const outcome: PinOutcome = planPin(
      stored,
      slug,
      held,
      featuredBadges(held, holders),
    );
    if (!outcome.ok) return outcome;
    await writePins(tx, userId, outcome.next);
    return { ok: true, pins: effectivePins(outcome.next, held) };
  });
}

/**
 * Unpins a badge (or any tier of its track). Always allowed, including for
 * a badge the member no longer holds.
 */
export function unpinShowcaseBadge(
  db: BadgeDb,
  userId: string,
  slug: string,
): Promise<ShowcaseWrite> {
  return db.transaction(async (tx) => {
    const stored = await lockPins(tx, userId);
    if (stored === null) return { ok: false, reason: "no_profile" };
    const next = planUnpin(stored, slug);
    if (next.length !== stored.length) await writePins(tx, userId, next);
    const held = await loadHeldBadgeSlugs(tx, userId);
    return { ok: true, pins: effectivePins(next, held) };
  });
}
