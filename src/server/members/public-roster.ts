import { and, eq, notInArray, sql } from "drizzle-orm";

import {
  HIDDEN_FROM_PUBLIC_DISPLAY_NAMES,
  HIDDEN_FROM_PUBLIC_USER_IDS,
} from "@/lib/public-roster";
import { memberProfiles, user } from "@/server/db/schema";

const hiddenNames = [...HIDDEN_FROM_PUBLIC_DISPLAY_NAMES];
const hiddenIds = [...HIDDEN_FROM_PUBLIC_USER_IDS];

/**
 * SQL gate for public /members + leaderboard + homepage count.
 * Combines is_public, the staff hidden_from_public flag, and the denylist
 * so ranks stay correct even before every env has the backfill applied.
 */
export function publicRosterVisibility() {
  return and(
    eq(memberProfiles.isPublic, true),
    eq(memberProfiles.hiddenFromPublic, false),
    notInArray(memberProfiles.userId, hiddenIds),
    sql`lower(btrim(${memberProfiles.displayName})) not in (${sql.join(
      hiddenNames.map((name) => sql`${name}`),
      sql`, `,
    )})`,
  );
}

/** Extra test-email host filter when `app.user` is already joined. */
export function publicRosterEmailVisibility() {
  return sql`(
    ${user.email} is null
    or (
      lower(${user.email}) not like '%@aitcommunity.local'
      and lower(${user.email}) not like '%@example.com'
      and lower(split_part(${user.email}, '@', 1)) not like 'greg+qa-%'
      and lower(split_part(${user.email}, '@', 1)) not like 'greg+qa+%'
    )
  )`;
}
