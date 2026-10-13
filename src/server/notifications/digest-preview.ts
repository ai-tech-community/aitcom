/** The only address a digest test send may use. Not configurable. */
export const DIGEST_TEST_RECIPIENT = "greg@klevox.com";

export type PreviewCaller = {
  email: string;
  /** Payload `users.role`. Null when this member is not a Payload user. */
  payloadRole: string | null;
};

/** Admin-only. A missing session is 401; anyone else is 403. */
export function previewAccess(caller: PreviewCaller | null): "ok" | 401 | 403 {
  if (!caller?.email) return 401;
  if (caller.payloadRole !== "admin") return 403;
  return "ok";
}

/**
 * `send=greg` is the only test send, and it always goes to the allowlisted
 * address. Any other send value, or an attempt to name a recipient, is refused.
 */
export function previewSendPlan(query: {
  send: string | null;
  to: string | null;
}):
  | { action: "render" }
  | { action: "send"; to: typeof DIGEST_TEST_RECIPIENT }
  | { action: "reject" } {
  if (query.to !== null) return { action: "reject" };
  if (query.send === null) return { action: "render" };
  if (query.send === "greg") {
    return { action: "send", to: DIGEST_TEST_RECIPIENT };
  }
  return { action: "reject" };
}

/** Last-line check before any test send leaves the server. */
export function assertDigestTestRecipient(to: string): void {
  if (to !== DIGEST_TEST_RECIPIENT) {
    throw new Error("Digest test send refused");
  }
}
