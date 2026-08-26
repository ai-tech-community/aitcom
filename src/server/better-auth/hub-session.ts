export type HubAuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export type HubMembershipSeed = {
  slug: string;
  status: "active" | "pending_approval" | "invited" | "banned";
  role: "owner" | "admin" | "moderator" | "member";
};

export function toHubAuthUser(
  user:
    | {
        id: string;
        name?: string | null;
        email?: string | null;
        image?: string | null;
      }
    | null
    | undefined,
): HubAuthUser | null {
  if (!user?.id) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };
}

/**
 * Hub and the navbar decide signed-in from `useSession` (GET /get-session).
 * After verify, the document request already has the Set-Cookie; the client
 * fetch can still miss it. Prefer the client user when present, otherwise
 * keep the server user from that document request.
 *
 * Navbar sign-out reloads the document so this does not keep a stale user.
 */
export function resolveHubAuthUser(
  serverUser: HubAuthUser | null | undefined,
  clientUser: HubAuthUser | null | undefined,
): HubAuthUser | null {
  return clientUser ?? serverUser ?? null;
}

export function memberRoleForSlug(
  rows: HubMembershipSeed[] | null | undefined,
  slug: string,
): HubMembershipSeed["role"] | null {
  const row = rows?.find((m) => m.slug === slug && m.status === "active");
  return row?.role ?? null;
}

export function membershipStatusForSlug(
  rows: HubMembershipSeed[] | null | undefined,
  slug: string,
): "active" | "pending_approval" | "invited" | null {
  const row = rows?.find((m) => m.slug === slug);
  if (
    row?.status === "active" ||
    row?.status === "pending_approval" ||
    row?.status === "invited"
  ) {
    return row.status;
  }
  return null;
}
