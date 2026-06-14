// Pure Borda-style aggregation of human judge rankings into a final order.
// Lower mean rank wins; ties break by higher automated verification score, then
// earliest submission, then teamId (mirrors the deterministic chain in scoring.ts).

export interface JudgeRankRow {
  judgeUserId: string;
  teamId: string;
  rank: number;
}

export interface AggregatedTeam {
  teamId: string;
  finalRank: number;
}

export function aggregateJudgeRankings(
  rankings: JudgeRankRow[],
  automatedScores: Map<string, number>,
  submittedAt: Map<string, Date>,
): AggregatedTeam[] {
  const sums = new Map<string, { total: number; count: number }>();
  for (const r of rankings) {
    const cur = sums.get(r.teamId) ?? { total: 0, count: 0 };
    cur.total += r.rank;
    cur.count += 1;
    sums.set(r.teamId, cur);
  }

  const teams = [...sums.entries()].map(([teamId, { total, count }]) => ({
    teamId,
    mean: total / count,
  }));

  teams.sort((a, b) => {
    if (a.mean !== b.mean) return a.mean - b.mean;
    const sa = automatedScores.get(a.teamId) ?? 0;
    const sb = automatedScores.get(b.teamId) ?? 0;
    if (sb !== sa) return sb - sa;
    const ta = submittedAt.get(a.teamId);
    const tb = submittedAt.get(b.teamId);
    if (ta && tb) {
      const d = ta.getTime() - tb.getTime();
      if (d !== 0) return d;
    }
    return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
  });

  return teams.map((t, i) => ({ teamId: t.teamId, finalRank: i + 1 }));
}
