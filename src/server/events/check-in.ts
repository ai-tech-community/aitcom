/**
 * Check-in (#369): the event organizer confirms at the door that a
 * registered member came. Checking in moves `registered` → `attended` and
 * stamps the time; undo moves it back. Nobody else can be checked in — a
 * waitlisted, unpaid or cancelled registration never took a seat.
 */
export type CheckInResult =
  | { status: "attended"; checkedInAt: Date }
  | { status: "registered"; checkedInAt: null };

export function checkInTransition(
  current: { status: string; checkedInAt: Date | null },
  checkedIn: boolean,
  now: Date = new Date(),
): CheckInResult | null {
  if (checkedIn) {
    if (current.status === "attended") {
      // Already in: keep the first time, so a double tap changes nothing.
      return { status: "attended", checkedInAt: current.checkedInAt ?? now };
    }
    return current.status === "registered"
      ? { status: "attended", checkedInAt: now }
      : null;
  }
  return current.status === "attended" || current.status === "registered"
    ? { status: "registered", checkedInAt: null }
    : null;
}
