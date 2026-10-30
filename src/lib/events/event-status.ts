/** Statuses whose live event details are listed publicly within their audience. */
export const PUBLICLY_LISTED_EVENT_STATUSES = [
  "published",
  "cancelled",
  "completed",
] as const;

export function isPubliclyListedEventStatus(
  status: string | null | undefined,
): status is (typeof PUBLICLY_LISTED_EVENT_STATUSES)[number] {
  return PUBLICLY_LISTED_EVENT_STATUSES.some((listed) => listed === status);
}
