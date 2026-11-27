import { and, desc, eq } from "drizzle-orm";

import type { db } from "@/server/db";
import { spaces } from "@/server/db/schema";

import type { OptionalBuiltinSurface } from "./space-defaults";

/**
 * What adding an optional builtin space needs from the database. The app's
 * `db` and a transaction both satisfy it, so a caller can add the space in
 * the same transaction as the feature that turns it on.
 */
export type SpaceWriter = Pick<typeof db, "select" | "insert">;

/**
 * Something other than the expected builtin surface (a room, today) owns the
 * slug in the community. Each feature maps it to its own refusal; the space
 * is never skipped silently.
 */
export class SpaceSlugTakenError extends Error {
  constructor(readonly slug: string) {
    super(`Space slug "${slug}" is taken`);
    this.name = "SpaceSlugTakenError";
  }
}

type SlugOwner = {
  kind: "builtin" | "room";
  builtinSurface: string | null;
};

async function findSlugOwner(
  database: SpaceWriter,
  communityId: string,
  slug: string,
): Promise<SlugOwner | undefined> {
  const [owner] = await database
    .select({ kind: spaces.kind, builtinSurface: spaces.builtinSurface })
    .from(spaces)
    .where(and(eq(spaces.communityId, communityId), eq(spaces.slug, slug)))
    .limit(1);
  return owner;
}

/**
 * True when the slug is held by the surface itself; throws
 * `SpaceSlugTakenError` when anything else holds it; false when it is free.
 */
function ownedBySurface(
  owner: SlugOwner | undefined,
  surface: OptionalBuiltinSurface,
  slug: string,
): boolean {
  if (!owner) return false;
  if (owner.kind === "builtin" && owner.builtinSurface === surface) return true;
  throw new SpaceSlugTakenError(slug);
}

/**
 * Throws `SpaceSlugTakenError` when something other than `surface` owns
 * `slug` in the community. For a feature that must refuse before it writes
 * anything else; `ensureOptionalBuiltinSpace` runs the same check itself.
 */
export async function assertOptionalBuiltinSlugFree(
  database: SpaceWriter,
  communityId: string,
  surface: OptionalBuiltinSurface,
  slug: string,
): Promise<void> {
  ownedBySurface(
    await findSlugOwner(database, communityId, slug),
    surface,
    slug,
  );
}

/**
 * Adds the optional builtin space `surface` at `slug`, after the community's
 * other spaces. Idempotent: an existing row is left as the owners set it
 * (renamed, hidden or moved). Throws `SpaceSlugTakenError` when anything
 * else owns the slug, including a room that took it during the insert.
 */
export async function ensureOptionalBuiltinSpace(
  database: SpaceWriter,
  communityId: string,
  surface: OptionalBuiltinSurface,
  slug: string,
): Promise<{ added: boolean }> {
  const owner = await findSlugOwner(database, communityId, slug);
  if (ownedBySurface(owner, surface, slug)) return { added: false };

  const [last] = await database
    .select({ position: spaces.position })
    .from(spaces)
    .where(eq(spaces.communityId, communityId))
    .orderBy(desc(spaces.position))
    .limit(1);

  const inserted = await database
    .insert(spaces)
    .values({
      communityId,
      kind: "builtin",
      builtinSurface: surface,
      name: null,
      slug,
      position: last ? last.position + 1 : 0,
    })
    .onConflictDoNothing({ target: [spaces.communityId, spaces.slug] })
    .returning({ id: spaces.id });
  if (inserted.length > 0) return { added: true };

  // The slug was taken between the check and the insert: by the surface
  // itself (another request added it) or by something else.
  ownedBySurface(
    await findSlugOwner(database, communityId, slug),
    surface,
    slug,
  );
  return { added: false };
}
