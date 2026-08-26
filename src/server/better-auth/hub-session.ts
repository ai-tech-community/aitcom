export type HubAuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

/**
 * Hub and the navbar decide signed-in from `useSession` (GET /get-session).
 * After verify, the document request already has the Set-Cookie; the client
 * fetch can still miss it. Prefer the client user when present, otherwise
 * keep the server user from that document request.
 */
export function resolveHubAuthUser(
  serverUser: HubAuthUser | null | undefined,
  clientUser: HubAuthUser | null | undefined,
): HubAuthUser | null {
  return clientUser ?? serverUser ?? null;
}
