// Pure issuance rules for hackathon certificates (issued at finalize): members
// of the team(s) that actually received the prize get a winner certificate;
// members of every other submitted team get a participation certificate.
// "Actually received the prize" follows the disbursement marker via
// prizeRecipients (re-finalize recomputes finalRank but never re-pays), with
// the legacy finalRank===1 fallback. Db-free so the rules are unit-testable;
// idempotency across finalize re-runs is structural (unique
// challenge_id+user_id index, insert ... ON CONFLICT DO NOTHING).

import { prizeRecipients } from "./winners";

export type CertificateKind = "winner" | "participant";

export interface CertifiableTeam {
  teamId: string;
  submitted: boolean;
  finalRank: number | null;
  prizeAwarded: boolean;
}

export interface TeamMembership {
  teamId: string;
  userId: string;
}

export interface CertificateAward {
  userId: string;
  kind: CertificateKind;
}

export function certificateAwards(
  teams: CertifiableTeam[],
  members: TeamMembership[],
): CertificateAward[] {
  const submitted = teams.filter((t) => t.submitted);
  if (submitted.length === 0) return [];

  const submittedIds = new Set(submitted.map((t) => t.teamId));
  const winnerIds = new Set(prizeRecipients(submitted).map((t) => t.teamId));

  // At most one certificate per user; winner wins over participant should a
  // user ever appear on more than one team.
  const byUser = new Map<string, CertificateKind>();
  for (const m of members) {
    if (!submittedIds.has(m.teamId)) continue;
    const kind: CertificateKind = winnerIds.has(m.teamId)
      ? "winner"
      : "participant";
    if (kind === "winner" || !byUser.has(m.userId)) {
      byUser.set(m.userId, kind);
    }
  }

  return [...byUser.entries()].map(([userId, kind]) => ({ userId, kind }));
}
