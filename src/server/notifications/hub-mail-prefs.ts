export const HUB_MAIL_CASES = [
  "dm",
  "mention",
  "forumReply",
  "digest",
  "agentJob",
] as const;

export type HubMailCase = (typeof HUB_MAIL_CASES)[number];

export type HubMailPrefs = Record<HubMailCase, boolean>;

/** Absence of a row = these defaults. Only DM is live in this first cut. */
export const DEFAULT_HUB_MAIL_PREFS: HubMailPrefs = {
  dm: true,
  mention: false,
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

/**
 * First cut: only Hub DM mail is allowed to send, and only when the
 * member left that toggle on (default). Other stored cases never fire.
 */
export function canSendHubMail(
  prefs: HubMailPrefs,
  mailCase: HubMailCase,
): boolean {
  if (mailCase !== "dm") return false;
  return prefs.dm;
}

export function isHubDmConversation(type: string | null | undefined): boolean {
  return type === "dm";
}

export function unreadAnchorKey(lastReadAt: Date | null | undefined): string {
  return lastReadAt ? lastReadAt.toISOString() : "never";
}
