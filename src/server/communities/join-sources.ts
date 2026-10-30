import type { SQL } from "drizzle-orm";

import type { JoinSource } from "@/lib/communities/join-source";
import type { Deps } from "@/server/magazines/deps";
import { magazineJoinSource } from "@/server/magazines/issue-origin";

/** A source owns verification and the matching activity metadata writer/reader. */
export type JoinSourceEntry<S extends JoinSource> = {
  verify: (deps: Deps, communityId: string, source: S) => Promise<S | null>;
  metadata: (source: S) => Record<string, string | number>;
  condition: (source: S) => SQL;
};

export const JOIN_SOURCES: {
  [V in JoinSource["via"]]: JoinSourceEntry<Extract<JoinSource, { via: V }>>;
} = { magazine: magazineJoinSource };

function entryFor<V extends JoinSource["via"]>(
  source: Extract<JoinSource, { via: V }>,
) {
  return JOIN_SOURCES[source.via] as JoinSourceEntry<
    Extract<JoinSource, { via: V }>
  >;
}

/** Verification, including dependency loading, never prevents joining. */
export async function verifyJoinSource(
  deps: Deps | (() => Promise<Deps>),
  communityId: string,
  source: JoinSource,
): Promise<JoinSource | null> {
  try {
    const loaded = typeof deps === "function" ? await deps() : deps;
    return await entryFor(source).verify(loaded, communityId, source);
  } catch (error) {
    console.error("[communities] join source verification failed", {
      via: source.via,
      error,
    });
    return null;
  }
}

/** Activity metadata writer; each source owns its matching reader. */
export function joinSourceMetadata(
  source: JoinSource,
): Record<string, string | number> {
  return entryFor(source).metadata(source);
}

/** The only SQL reader of join-source metadata. Values are parameters. */
export function joinSourceCondition(source: JoinSource): SQL {
  return entryFor(source).condition(source);
}
