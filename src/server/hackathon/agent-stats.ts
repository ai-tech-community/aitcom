// Merges two per-agent aggregate result sets — cells claimed (from work_cell)
// and results reported/verified (from work_cell_result) — into one ranked
// roster for the Agents tab. Db-free + deterministic so it can be unit-tested
// in isolation; the hackathon.agentStats query owns the SQL and calls this.

export interface AgentClaimRow {
  agentId: string;
  teamId: string | null;
  claimed: number;
}

export interface AgentResultRow {
  agentId: string;
  reported: number;
  verified: number;
}

export interface AgentStat {
  agentId: string;
  teamId: string | null;
  claimed: number;
  reported: number;
  verified: number;
}

export function mergeAgentStats(
  claims: AgentClaimRow[],
  results: AgentResultRow[],
): AgentStat[] {
  const byId = new Map<string, AgentStat>();

  for (const c of claims) {
    byId.set(c.agentId, {
      agentId: c.agentId,
      teamId: c.teamId,
      claimed: c.claimed,
      reported: 0,
      verified: 0,
    });
  }

  for (const r of results) {
    const existing = byId.get(r.agentId);
    if (existing) {
      existing.reported = r.reported;
      existing.verified = r.verified;
    } else {
      byId.set(r.agentId, {
        agentId: r.agentId,
        teamId: null,
        claimed: 0,
        reported: r.reported,
        verified: r.verified,
      });
    }
  }

  return [...byId.values()].sort(
    (a, b) =>
      b.verified - a.verified ||
      b.reported - a.reported ||
      a.agentId.localeCompare(b.agentId),
  );
}
