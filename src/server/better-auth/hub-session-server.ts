import "server-only";

import { cache } from "react";

import { listMyCommunities } from "@/server/communities/my-communities";
import { db } from "@/server/db";

import {
  toHubAuthUser,
  type HubAuthUser,
  type HubMembershipSeed,
} from "./hub-session";
import { getSession } from "./server";

export type HubAuthSeed = {
  initialUser: HubAuthUser | null;
  initialMemberships: HubMembershipSeed[];
};

/**
 * Document-request seed for Hub / navbar. getSession is already React-cache'd;
 * this cache keeps membership on the same request as the locale layout.
 */
export const loadHubAuthSeed = cache(async (): Promise<HubAuthSeed> => {
  const session = await getSession();
  const initialUser = toHubAuthUser(session?.user);
  if (!initialUser) {
    return { initialUser: null, initialMemberships: [] };
  }
  const rows = await listMyCommunities(db, initialUser.id);
  return {
    initialUser,
    initialMemberships: rows.map((row) => ({
      slug: row.slug,
      status: row.status,
      role: row.role,
    })),
  };
});
