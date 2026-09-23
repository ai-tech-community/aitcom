export const TRACKING_STATUSES = [
  "applying",
  "applied",
  "talking",
  "offer",
  "passed",
] as const;

export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

export function isTrackingStatus(value: string): value is TrackingStatus {
  return (TRACKING_STATUSES as readonly string[]).includes(value);
}
