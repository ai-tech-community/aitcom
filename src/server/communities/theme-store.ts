import { sql, type SQL } from "drizzle-orm";

import {
  DEFAULT_COMMUNITY_THEME_ID,
  isCommunityThemeId,
  type CommunityThemeId,
} from "@/lib/communities/themes";

type SqlDb = {
  execute: (query: SQL) => Promise<unknown>;
};

/** Postgres `undefined_table`. */
const UNDEFINED_TABLE = "42P01";

/** The driver text for the same case, for drivers that drop the code. */
const MISSING_TABLE_TEXT =
  /relation "?(?:app\.)?community_theme"? does not exist/i;

/** The error and every `cause` below it, stopping on a cycle. */
function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  while (
    current !== undefined &&
    current !== null &&
    !chain.includes(current)
  ) {
    chain.push(current);
    current =
      typeof current === "object"
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return chain;
}

/**
 * Preview builds skip migrations, so the theme table may be absent. Only
 * that case counts: a permission, lock or connection error on the table
 * must still fail, even when the message quotes the SQL.
 */
export function isMissingCommunityThemeSchema(error: unknown): boolean {
  return causeChain(error).some((link) => {
    if (typeof link === "string") return MISSING_TABLE_TEXT.test(link);
    if (typeof link !== "object" || link === null) return false;
    const { code, message } = link as { code?: unknown; message?: unknown };
    if (code === UNDEFINED_TABLE) return true;
    return typeof message === "string" && MISSING_TABLE_TEXT.test(message);
  });
}

function firstRow(result: unknown): Record<string, unknown> | undefined {
  const rows = Array.isArray(result)
    ? result
    : result && typeof result === "object" && "rows" in result
      ? (result as { rows?: unknown }).rows
      : undefined;
  return Array.isArray(rows)
    ? (rows[0] as Record<string, unknown> | undefined)
    : undefined;
}

/** A missing row, a look no longer in the catalog, or no table all read as Plain. */
export async function readCommunityThemeId(
  database: SqlDb,
  communityId: string,
): Promise<CommunityThemeId> {
  try {
    const result = await database.execute(sql`
      SELECT "theme_id"
      FROM "app"."community_theme"
      WHERE "community_id" = ${communityId}
      LIMIT 1
    `);
    const stored = firstRow(result)?.theme_id;
    return isCommunityThemeId(stored) ? stored : DEFAULT_COMMUNITY_THEME_ID;
  } catch (error) {
    if (!isMissingCommunityThemeSchema(error)) throw error;
    return DEFAULT_COMMUNITY_THEME_ID;
  }
}

/** Plain is the absence of a choice, so picking it removes the row. */
export async function writeCommunityThemeId(
  database: SqlDb,
  communityId: string,
  themeId: CommunityThemeId,
  userId: string,
): Promise<void> {
  if (themeId === DEFAULT_COMMUNITY_THEME_ID) {
    await database.execute(sql`
      DELETE FROM "app"."community_theme"
      WHERE "community_id" = ${communityId}
    `);
    return;
  }
  await database.execute(sql`
    INSERT INTO "app"."community_theme"
      ("community_id", "theme_id", "updated_by", "updated_at")
    VALUES (${communityId}, ${themeId}, ${userId}, now())
    ON CONFLICT ("community_id") DO UPDATE
    SET "theme_id" = EXCLUDED."theme_id",
      "updated_by" = EXCLUDED."updated_by",
      "updated_at" = now()
  `);
}
