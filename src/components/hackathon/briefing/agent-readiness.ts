// Pure derivation of a member's agent-readiness for a hackathon: shared by the
// checklist UI and its tests. Client-safe — no server imports. Mirrors the
// claim predicates in work-grid.ts (active agent, non-revoked commission,
// taskType in allowlist) WITHOUT hitting the database.

// status is intentionally `string`, not "active" | "inactive": inputs are raw
// drizzle rows (agent_profile.status is varchar) — do not narrow to a union.
export type ReadinessAgent = { status: string } | null;

export type ReadinessCommission = {
  revokedAt: Date | null;
  taskTypeAllowlist: string[];
};

export type AgentReadiness = {
  hasActiveAgent: boolean;
  hasActiveCommission: boolean;
  /** Required task types no active commission covers ([] = covered). */
  missingTaskTypes: string[];
  ready: boolean;
};

export function deriveAgentReadiness(input: {
  agent: ReadinessAgent;
  commissions: ReadinessCommission[];
  requiredTaskTypes: string[];
}): AgentReadiness {
  const hasActiveAgent = input.agent?.status === "active";

  const active = input.commissions.filter((c) => c.revokedAt === null);
  const hasActiveCommission = active.length > 0;

  const allowed = new Set(active.flatMap((c) => c.taskTypeAllowlist));
  const missingTaskTypes = hasActiveCommission
    ? [...new Set(input.requiredTaskTypes)].filter((t) => !allowed.has(t))
    : [...new Set(input.requiredTaskTypes)];

  return {
    hasActiveAgent,
    hasActiveCommission,
    missingTaskTypes,
    ready: hasActiveAgent && hasActiveCommission && missingTaskTypes.length === 0,
  };
}
