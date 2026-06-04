/**
 * The task-type allowlist firebreak from ADR-0022.
 *
 * A commission names the task types it permits; a cell whose task type is
 * outside that allowlist must be rejected *before* the agent works it ("rejected
 * before the agent sees it"). This is the single source of truth for that gate:
 * the `listClaimable` filter and the `claimCell` guard in `work-grid.ts` both
 * route through it.
 *
 * It is a leaf module with no database or tRPC imports so the firebreak can be
 * unit-tested as pure logic, with no DB.
 *
 * An empty or missing allowlist permits nothing — a commission with no task
 * types claims no cells.
 */
export function isTaskTypeAllowed(
  allowlist: string[] | null | undefined,
  taskType: string,
): boolean {
  if (!allowlist || allowlist.length === 0) {
    return false;
  }
  return allowlist.includes(taskType);
}
