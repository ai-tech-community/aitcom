import { eq } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { memberProfiles, user } from "@/server/db/schema";
import { oneLine } from "@/lib/text-utils";

type DB = typeof _db;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * The name a member is shown by: their profile display name, else their
 * account name, on one line. A blank profile name does not hide the account
 * name. Null when neither is set.
 */
export function shownMemberName(
  profileName: string | null | undefined,
  accountName: string | null | undefined,
): string | null {
  const profile = oneLine(profileName ?? "");
  const account = oneLine(accountName ?? "");
  return profile || account || null;
}

/**
 * The name a member is shown by: their profile name, else their account
 * name, on one line. Null for an unknown member or one without any name.
 */
export async function memberDisplayName(
  db: DB | Tx,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ profileName: memberProfiles.displayName, accountName: user.name })
    .from(user)
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);
  return shownMemberName(row?.profileName, row?.accountName);
}
