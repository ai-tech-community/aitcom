export const HUB_MAIL_CASES = [
  "dm",
  "mention",
  "forumReply",
  "digest",
  "agentJob",
] as const;

export type HubMailCase = (typeof HUB_MAIL_CASES)[number];

export type HubMailPrefs = Record<HubMailCase, boolean>;

/** Absence of a row = these defaults. DM and mention mail are live. */
export const DEFAULT_HUB_MAIL_PREFS: HubMailPrefs = {
  dm: true,
  mention: true,
  forumReply: false,
  digest: false,
  agentJob: false,
};

export function resolveHubMailPrefs(
  row: Partial<HubMailPrefs> | null | undefined,
): HubMailPrefs {
  return {
    ...DEFAULT_HUB_MAIL_PREFS,
    ...row,
  };
}

/** The cases that send mail today; the others are stored for later. */
const LIVE_HUB_MAIL_CASES: readonly HubMailCase[] = ["dm", "mention"];

/**
 * Whether a mail case may be sent to a member: only a live case, and only
 * when the member left its toggle on (both are on by default).
 */
export function canSendHubMail(
  prefs: HubMailPrefs,
  mailCase: HubMailCase,
): boolean {
  if (!LIVE_HUB_MAIL_CASES.includes(mailCase)) return false;
  return prefs[mailCase];
}

export function isHubDmConversation(type: string | null | undefined): boolean {
  return type === "dm";
}

export function unreadAnchorKey(lastReadAt: Date | null | undefined): string {
  return lastReadAt ? lastReadAt.toISOString() : "never";
}
