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
 * After verify / password sign-in the document already has the Set-Cookie;
 * `headers()` can still omit it. Prefer the client user when present,
 * otherwise keep the server user from that document request (`cookies()`).
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

/**
 * Hub leftover paint after verify / password sign-in. JOIN and the feed /
 * forum sign-in copy are all `!user` — not a missing `ait` membership.
 */
export function hubDocumentPaint(
  user: HubAuthUser | null | undefined,
  memberships: HubMembershipSeed[] | null | undefined,
  slug = "ait",
) {
  const signedIn = Boolean(user?.id);
  return {
    navbarJoin: !signedIn,
    feedSignIn: !signedIn,
    forumSignInToPost: !signedIn,
    communityJoin: signedIn && !memberRoleForSlug(memberships, slug),
  };
}
