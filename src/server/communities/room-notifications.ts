/**
 * Pure helpers for room membership notifications (Plan 2b). Side-effect free so
 * the recipient/dedupe logic is unit-testable without a database.
 */

/**
 * Recipients for a `room_access_request` notification: the community owners/
 * admins who can act on it (approve/deny), deduped and excluding the requester.
 */
export function roomAccessRequestRecipients(
  adminUserIds: string[],
  requesterId: string,
): string[] {
  return [...new Set(adminUserIds)].filter((id) => id !== requesterId);
}
