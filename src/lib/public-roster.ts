/**
 * Public /members leaderboard visibility.
 *
 * `app.member_profile` has no historic is_test / bot column. Public roster
 * queries hide staff-flagged rows plus a small named denylist so junk and
 * one duplicate human do not appear — without deleting user rows.
 *
 * Do not invent LinkedIn or other social identity here. Matching is by
 * staff flag, user id, display name, or obvious test-email hosts.
 */

/** Duplicate LVL 1 / 20 XP "Soren Ravn" (`@soren-lang`). Keep the LVL 4 row. */
export const DUPLICATE_SOREN_RAVN_USER_ID = "j0vb7bdLmBEERecZmiQ5ytYEqltLoFFX";

/** Real Soren Ravn (LVL 4, 687 XP). Human — must not be labeled as an agent. */
export const REAL_SOREN_RAVN_USER_ID = "VcJ1XJ3qmU7Xyk6nJGTmpt1iPBK4xtbd";

/** Known production junk / QA / duplicate ids. Rows stay in the database. */
export const HIDDEN_FROM_PUBLIC_USER_IDS: ReadonlySet<string> = new Set([
  "tBZwvwahpnlGRTJ1crG42f9HYfe0ZQV7", // Dev User
  "W0aniPJoK3xsV2pbuxRekvElvbf3mbKe", // Review Bot 3002
  "JnZ622Cyf9K3NiqHIoA4lL9XtN9cJMca", // 445983370-cmd
  DUPLICATE_SOREN_RAVN_USER_ID,
  "qTXhAdPZEpmpYLCAEUs7lGTIsnSfGyDZ", // QA Human
  "DSjyTaGswyYusg5kDyqvKq4OLg9IN0oP", // QA Fuse
]);

/** Case-insensitive display-name denylist. Do not add "Soren Ravn" here. */
export const HIDDEN_FROM_PUBLIC_DISPLAY_NAMES: ReadonlySet<string> = new Set([
  "dev user",
  "review bot 3002",
  "445983370-cmd",
  "qa human",
  "qa fuse",
]);

export interface PublicRosterMember {
  userId: string;
  displayName: string;
  email?: string | null;
  hiddenFromPublic?: boolean | null;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function isTestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (normalized.endsWith("@aitcommunity.local")) return true;
  if (normalized.endsWith("@example.com")) return true;
  const local = normalized.split("@")[0] ?? "";
  return local.startsWith("greg+qa-") || local.startsWith("greg+qa+");
}

/** True when this member must not appear on the public roster. */
export function isHiddenFromPublicRoster(member: PublicRosterMember): boolean {
  if (member.hiddenFromPublic) return true;
  if (HIDDEN_FROM_PUBLIC_USER_IDS.has(member.userId)) return true;
  if (HIDDEN_FROM_PUBLIC_DISPLAY_NAMES.has(normalizeName(member.displayName))) {
    return true;
  }
  return isTestEmail(member.email);
}

/**
 * Bot icon on /members means "this human owns an active agent".
 * Soren Ravn is a human; his owned agent must not relabel him as an agent.
 * Wren is not in this override — leave her classification unchanged.
 */
export function hasAgentOnPublicRoster(opts: {
  userId: string;
  ownedActiveAgentId: string | null | undefined;
}): boolean {
  if (opts.userId === REAL_SOREN_RAVN_USER_ID) return false;
  return Boolean(opts.ownedActiveAgentId);
}
