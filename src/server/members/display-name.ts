import { eq, inArray } from "drizzle-orm";

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

export type MemberNames = {
  profileName: string | null;
  accountName: string | null;
};

/** Profile and account names for a set of members, one query. */
export async function memberNamesByUserId(
  db: DB | Tx,
  userIds: readonly string[],
): Promise<Map<string, MemberNames>> {
  const ids = [...new Set(userIds.filter((id) => id.length > 0))];
  const names = new Map<string, MemberNames>();
  if (ids.length === 0) return names;
  const rows = await db
    .select({
      userId: user.id,
      profileName: memberProfiles.displayName,
      accountName: user.name,
    })
    .from(user)
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .where(inArray(user.id, ids));
  for (const row of rows) {
    names.set(row.userId, {
      profileName: row.profileName,
      accountName: row.accountName,
    });
  }
  return names;
}

/**
 * The byline to show without rewriting the stored author name. A stored
 * account name (`greg`) becomes the profile display name (`gregy`). A
 * composed byline that contains the account name is updated in place.
 * A custom byline that does not mention the account name is left as stored.
 */
export function authorBylineAtReadTime(
  stored: string | null | undefined,
  names: MemberNames | null | undefined,
): string | null {
  const saved = oneLine(stored ?? "") || null;
  if (!names) return saved;
  const live = shownMemberName(names.profileName, names.accountName);
  const account = oneLine(names.accountName ?? "") || null;
  if (!live || !account || live === account) return saved ?? live;
  if (!saved) return live;
  if (saved === account) return live;
  return replaceWholeName(saved, account, live);
}

/**
 * Swap the account name for the display name only as a whole token.
 * `greg` inside the already-correct `gregy` must stay `gregy`, not `gregyy`.
 */
function replaceWholeName(
  saved: string,
  account: string,
  live: string,
): string {
  const escaped = account.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return saved.replace(
    new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu"),
    live,
  );
}

/** Replace stored bylines with the live display name. Does not write. */
export async function withAuthorBylines<
  T extends { authorId?: string | null; authorName: string | null },
>(db: DB | Tx, items: readonly T[]): Promise<T[]> {
  const names = await memberNamesByUserId(
    db,
    items
      .map((item) => item.authorId)
      .filter((id): id is string => Boolean(id)),
  );
  return items.map((item) => ({
    ...item,
    authorName: authorBylineAtReadTime(
      item.authorName,
      item.authorId ? (names.get(item.authorId) ?? null) : null,
    ),
  }));
}
