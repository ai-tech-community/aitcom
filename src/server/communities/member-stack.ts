import { ROLE_HIERARCHY, type CommunityRole } from "./role-utils";

/** Max face avatars fetched/shown when a community does NOT overflow
 *  (total ≤ this). At this size and below, every circle is a real face and
 *  there is no "+N" bubble. */
export const MEMBER_STACK_MAX_FACES = 5;

/** When a community DOES overflow (total > MEMBER_STACK_MAX_FACES), show this
 *  many faces and turn the final circle into the "+N" overflow count. Keeps
 *  the row at MEMBER_STACK_MAX_FACES circles total. */
export const MEMBER_STACK_FACES_WITH_OVERFLOW = 4;

/** Below this active-member total the stack is suppressed (a single lone
 *  avatar is not a stack). */
export const MEMBER_STACK_MIN_TOTAL = 2;

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

/** What the stack actually renders, given the available public faces and the
 *  active total. The "+N" circle appears ONLY when the community has more than
 *  MEMBER_STACK_MAX_FACES members; below that it's all faces, no count.
 *
 *  - total ≤ MEMBER_STACK_MAX_FACES → up to that many faces, no overflow.
 *  - total >  MEMBER_STACK_MAX_FACES → MEMBER_STACK_FACES_WITH_OVERFLOW faces
 *    (fewer if not enough public ones) and overflow = everyone beyond them.
 *
 *  Overflow counts everyone active beyond the shown faces, private members
 *  included (they are counted, never shown — profile-visibility opt-out). */
export interface PresentedStack {
  shownFaces: StackFace[];
  overflow: number;
}

export function presentStack(
  faces: StackFace[],
  totalActiveCount: number,
): PresentedStack {
  if (totalActiveCount > MEMBER_STACK_MAX_FACES) {
    const shownFaces = faces.slice(0, MEMBER_STACK_FACES_WITH_OVERFLOW);
    return {
      shownFaces,
      overflow: Math.max(0, totalActiveCount - shownFaces.length),
    };
  }
  return { shownFaces: faces.slice(0, MEMBER_STACK_MAX_FACES), overflow: 0 };
}
