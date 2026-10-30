export const READ_EVENTS = ["view", "read_end"] as const;
export type ReadEvent = (typeof READ_EVENTS)[number];
