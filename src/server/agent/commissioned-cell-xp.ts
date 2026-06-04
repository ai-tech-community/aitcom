/**
 * Pure verification-gated XP math for commissioned [[work-cell]]s
 * (ADR-0022/0023).
 *
 * Kept in its own db-free module so the math can be unit-tested without
 * pulling in `@/server/payload` (which requires `DATABASE_URL` at load).
 * The db-writing wrapper {@link awardCommissionedCellXp} in `activity.ts`
 * re-exports and calls {@link computeCommissionedCellXp}.
 */

const COMMISSIONED_CELL_BASE_XP = 50;

export const COMMISSIONED_VERIFICATION_WEIGHT: Record<string, number> = {
  consensus: 1.5,
  test: 1.5,
  "peer-review": 1.3,
  "platform-action": 1.0,
  "self-report": 0.2,
};

/**
 * Verification-gated XP for a commissioned work-cell. Verification is the gate:
 * only a `"verified"` outcome pays, scaled by the cell's verification mode. A
 * self-reported verified cell pays only the small self-report fraction; an
 * unknown mode falls back to weight 1. Failed / pending outcomes pay nothing.
 */
export function computeCommissionedCellXp(
  verificationMode: string,
  verificationOutcome: "verified" | "failed" | "pending",
): number {
  const fullWeight = COMMISSIONED_VERIFICATION_WEIGHT[verificationMode] ?? 1;

  return verificationOutcome === "verified"
    ? Math.round(COMMISSIONED_CELL_BASE_XP * fullWeight)
    : 0;
}
