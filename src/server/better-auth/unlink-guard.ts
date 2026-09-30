import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";

import {
  canDisconnectProvider,
  enabledOAuthProviders,
  isOAuthProvider,
  type OAuthProvider,
} from "@/lib/oauth-providers";

type LoadAccounts = (userId: string) => Promise<{ providerId: string }[]>;

/**
 * Enforce the "keep a working sign-in method" rule on Better Auth's own
 * POST /unlink-account, not only in members.disconnectSocial — the endpoint
 * is open to any signed-in client, and Better Auth itself only blocks
 * removing the very last account row, even when the remaining rows belong
 * to providers whose keys were removed.
 */
export async function assertCanUnlink(
  userId: string,
  providerId: unknown,
  deps: {
    loadAccounts: LoadAccounts;
    enabled?: Record<OAuthProvider, boolean>;
  },
): Promise<void> {
  if (typeof providerId !== "string") return;
  if (providerId !== "credential" && !isOAuthProvider(providerId)) return;
  const accounts = await deps.loadAccounts(userId);
  const allowed = canDisconnectProvider(
    providerId,
    accounts,
    deps.enabled ?? enabledOAuthProviders(),
  );
  if (!allowed.ok) {
    throw new APIError("BAD_REQUEST", {
      message: "Add another sign-in method before disconnecting.",
    });
  }
}

export function createUnlinkGuard(loadAccounts: LoadAccounts) {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/unlink-account") return;
    const current = await getSessionFromCtx(ctx);
    if (!current) return;
    const body = ctx.body as { providerId?: unknown } | undefined;
    await assertCanUnlink(current.user.id, body?.providerId, { loadAccounts });
  });
}
