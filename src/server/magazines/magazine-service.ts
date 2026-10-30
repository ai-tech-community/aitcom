import { and, desc, eq } from "drizzle-orm";

import type { IssueVisibility } from "@/lib/magazines/values";
import { MAX_MAGAZINE_TOPICS } from "@/lib/magazines/values";
import {
  resolveMagazineFont,
  type MagazineFont,
} from "@/lib/magazines/typography";
import {
  planVisibilityChange,
  type VisibilityRecord,
} from "@/lib/magazines/visibility";
import type { Magazine } from "@/payload-types";
import type { db } from "@/server/db";
import { spaces } from "@/server/db/schema";

import type { Deps, PayloadClient } from "./deps";
import { magazineError } from "./errors";
import { uniqueViolationPath } from "./payload-writes";

export type MagazineSettingsInput = {
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string | null;
  logoMediaId?: number | null;
  logoAlt?: string | null;
  coverMediaId?: number | null;
  coverImageUrl?: string | null;
  coverAlt?: string | null;
  font?: MagazineFont;
  topics: string[];
  defaultVisibility: IssueVisibility;
  confirmUnlistedPublic?: boolean;
};

export type MagazineCommunity = {
  id: string;
  slug: string;
  isListedInDirectory: boolean;
};

/** The slug of the Magazine tab; also its builtin surface id. */
const MAGAZINE_SPACE = "magazine";

/** The community's magazine, or null when it has none yet. */
export async function getMagazineForCommunity(
  payload: PayloadClient,
  communityId: string,
): Promise<Magazine | null> {
  const { docs } = await payload.find({
    collection: "magazines",
    where: { communityId: { equals: communityId } },
    depth: 0,
    limit: 1,
    pagination: false,
  });
  return docs[0] ?? null;
}

/** Trimmed, lower-cased, without blanks or repeats; at most five. */
export function normalizeTopics(topics: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of topics) {
    const topic = raw.trim().toLowerCase();
    if (topic) seen.add(topic);
  }
  return [...seen].slice(0, MAX_MAGAZINE_TOPICS);
}

export function magazineTopicsOf(magazine: Pick<Magazine, "topics">): string[] {
  return (magazine.topics ?? [])
    .map((t) => t.topic)
    .filter((t): t is string => Boolean(t));
}

type SpaceSlugOwner = {
  kind: "builtin" | "room";
  builtinSurface: string | null;
};

async function findMagazineSlugOwner(
  database: typeof db,
  communityId: string,
): Promise<SpaceSlugOwner | undefined> {
  return database.query.spaces.findFirst({
    where: and(
      eq(spaces.communityId, communityId),
      eq(spaces.slug, MAGAZINE_SPACE),
    ),
    columns: { kind: true, builtinSurface: true },
  });
}

function isMagazineTab(owner: SpaceSlugOwner): boolean {
  return owner.kind === "builtin" && owner.builtinSurface === MAGAZINE_SPACE;
}

/**
 * Refuses with `SPACE_SLUG_TAKEN` when something other than the Magazine
 * tab (a room, today) owns the slug "magazine" in the community.
 */
async function assertMagazineSpaceFree(
  database: typeof db,
  communityId: string,
): Promise<void> {
  const owner = await findMagazineSlugOwner(database, communityId);
  if (owner && !isMagazineTab(owner)) throw magazineError("SPACE_SLUG_TAKEN");
}

/**
 * Adds the Magazine tab (builtin surface `magazine`) after the community's
 * other spaces. Idempotent: an existing tab is left as the owners set it
 * (renamed, hidden or moved). Throws `SPACE_SLUG_TAKEN` when a room owns the
 * slug "magazine"; the tab is never skipped silently.
 */
export async function ensureMagazineSpace(
  database: typeof db,
  communityId: string,
): Promise<void> {
  await assertMagazineSpaceFree(database, communityId);

  const [last] = await database
    .select({ position: spaces.position })
    .from(spaces)
    .where(eq(spaces.communityId, communityId))
    .orderBy(desc(spaces.position))
    .limit(1);

  await database
    .insert(spaces)
    .values({
      communityId,
      kind: "builtin",
      builtinSurface: MAGAZINE_SPACE,
      name: null,
      slug: MAGAZINE_SPACE,
      position: last ? last.position + 1 : 0,
    })
    .onConflictDoNothing({ target: [spaces.communityId, spaces.slug] });

  // A room that took the slug between the check and the insert.
  await assertMagazineSpaceFree(database, communityId);
}

function currentDefault(magazine: Magazine | null): VisibilityRecord {
  return {
    visibility: magazine?.defaultVisibility ?? "members",
    publicConfirmedBy: magazine?.publicConfirmedBy ?? null,
    publicConfirmedAt: magazine?.publicConfirmedAt ?? null,
  };
}

/** A unique-index violation from a magazine write, as a magazine refusal. */
function mapMagazineWriteError(error: unknown): unknown {
  const path = uniqueViolationPath(error);
  if (path === null) return error;
  if (path === "slug") return magazineError("MAGAZINE_SLUG_TAKEN");
  if (path === "communityId" || path === "community_id") {
    return magazineError("MAGAZINE_EXISTS");
  }
  return error;
}

/**
 * Creates the community's magazine, or updates it when it exists. The
 * default visibility is written through `planVisibilityChange`, so `public`
 * in an unlisted community needs `confirmUnlistedPublic` and records who
 * confirmed it.
 *
 * Order (preflight F15): the Magazine tab's slug is checked before the
 * magazine is created, so a room called "magazine" refuses the whole save
 * instead of leaving a magazine without a tab; the tab is then ensured on
 * every save, which also restores one that went missing.
 */
export async function saveMagazineSettings(
  deps: Deps,
  community: MagazineCommunity,
  input: MagazineSettingsInput,
  actorId: string,
  actorLeadsCommunity: boolean,
): Promise<Magazine> {
  const existing = await getMagazineForCommunity(deps.payload, community.id);

  const plan = planVisibilityChange({
    next: input.defaultVisibility,
    current: currentDefault(existing),
    community,
    confirmUnlistedPublic: input.confirmUnlistedPublic ?? false,
    actorId,
    actorLeadsCommunity,
    now: new Date(),
  });
  if (!plan.ok) throw magazineError(plan.code);

  const data = {
    name: input.name,
    slug: input.slug,
    description: input.description ?? null,
    logoUrl: input.logoUrl ?? null,
    ...(input.logoMediaId !== undefined
      ? { logoMediaId: input.logoMediaId }
      : {}),
    ...(input.logoAlt !== undefined ? { logoAlt: input.logoAlt } : {}),
    ...(input.coverMediaId !== undefined
      ? { coverMediaId: input.coverMediaId }
      : {}),
    ...(input.coverImageUrl !== undefined
      ? { coverImageUrl: input.coverImageUrl }
      : {}),
    ...(input.coverAlt !== undefined ? { coverAlt: input.coverAlt } : {}),
    font: resolveMagazineFont(input.font ?? existing?.font),
    topics: normalizeTopics(input.topics).map((topic) => ({ topic })),
    defaultVisibility: plan.record.visibility,
    publicConfirmedBy: plan.record.publicConfirmedBy,
    publicConfirmedAt: plan.record.publicConfirmedAt,
  };

  await assertMagazineSpaceFree(deps.db, community.id);

  let magazine: Magazine;
  try {
    magazine = existing
      ? await deps.payload.update({
          collection: "magazines",
          id: existing.id,
          data,
          depth: 0,
        })
      : await deps.payload.create({
          collection: "magazines",
          data: { ...data, communityId: community.id, createdBy: actorId },
          depth: 0,
        });
  } catch (error) {
    throw mapMagazineWriteError(error);
  }

  await ensureMagazineSpace(deps.db, community.id);
  return magazine;
}

/** Logo write plus a new settings timestamp. The settings form remounts on it. */
export function magazineLogoData(logoUrl: string | null, now = new Date()) {
  return { logoUrl, updatedAt: now.toISOString() };
}

/** Logo, cover, and their alt text. Other settings stay as they were saved. */
export async function updateMagazineImages(
  payload: PayloadClient,
  magazineId: number,
  images: {
    logoUrl?: string | null;
    logoMediaId?: number | null;
    logoAlt?: string | null;
    coverImageUrl?: string | null;
    coverMediaId?: number | null;
    coverAlt?: string | null;
  },
): Promise<Magazine> {
  return payload.update({
    collection: "magazines",
    id: magazineId,
    data: { ...images, updatedAt: new Date().toISOString() },
    depth: 0,
  });
}

/** Sets the magazine logo only. Other settings stay as they were saved. */
export async function setMagazineLogoUrl(
  payload: PayloadClient,
  magazineId: number,
  logoUrl: string | null,
): Promise<Magazine> {
  return payload.update({
    collection: "magazines",
    id: magazineId,
    data: magazineLogoData(logoUrl),
    depth: 0,
  });
}
