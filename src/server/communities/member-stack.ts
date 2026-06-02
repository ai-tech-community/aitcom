import { ROLE_HIERARCHY, type CommunityRole } from "./role-utils";

/** Max avatar faces shown in a stack (Luma-style: a few faces + overflow). */
export const MEMBER_STACK_MAX_FACES = 4;

/** Below this active-member total the stack is suppressed (a lonely stack
 *  advertises deadness — the card/header keep their plain count text). */
export const MEMBER_STACK_MIN_TOTAL = 5;

/** A member considered for a face slot. */
export interface StackCandidate {
  userId: string;
  role: CommunityRole;
  displayName: string | null;
  image: string | null;
  isPublic: boolean;
  joinedAt: Date;
}

/** The minimal data a rendered avatar needs. */
export interface StackFace {
  userId: string;
  displayName: string | null;
  image: string | null;
}

/** Leadership-first (higher role rank first), then earliest joined. */
export function compareStackCandidates(
  a: StackCandidate,
  b: StackCandidate,
): number {
  const byRole = ROLE_HIERARCHY[b.role] - ROLE_HIERARCHY[a.role];
  if (byRole !== 0) return byRole;
  return a.joinedAt.getTime() - b.joinedAt.getTime();
}

/** Public faces only, leadership-first, capped at `maxFaces`. Honours the
 *  profile-visibility opt-out: private members are never shown as faces
 *  (but remain in the count — see overflowCount). */
export function selectStackFaces(
  candidates: StackCandidate[],
  maxFaces = MEMBER_STACK_MAX_FACES,
): StackFace[] {
  return candidates
    .filter((c) => c.isPublic)
    .sort(compareStackCandidates)
    .slice(0, maxFaces)
    .map(({ userId, displayName, image }) => ({ userId, displayName, image }));
}

/** Whether a community has enough active members to show a stack at all. */
export function shouldRenderStack(totalActiveCount: number): boolean {
  return totalActiveCount >= MEMBER_STACK_MIN_TOTAL;
}

/** The "+N" overflow: everyone active beyond the shown faces, private members
 *  included (they are counted, never shown). Clamped at zero. */
export function overflowCount(
  totalActiveCount: number,
  shownFaces: number,
): number {
  return Math.max(0, totalActiveCount - shownFaces);
}
