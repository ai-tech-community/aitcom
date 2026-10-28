import { sql, type SQL } from "drizzle-orm";

import type { JoinSource } from "@/lib/communities/join-source";
import type { db } from "@/server/db";
import { activityEvents } from "@/server/db/schema";
import { verifyMagazineJoinSource } from "@/server/magazines/issue-origin";
import type { getPayloadClient } from "@/server/payload";

type Deps = {
  db: typeof db;
  payload: Awaited<ReturnType<typeof getPayloadClient>>;
};
type JoinSourceVerifier<S extends JoinSource> = (
  deps: Deps,
  communityId: string,
  source: S,
) => Promise<S | null>;

export const JOIN_SOURCE_VERIFIERS: {
  [V in JoinSource["via"]]: JoinSourceVerifier<Extract<JoinSource, { via: V }>>;
} = { magazine: verifyMagazineJoinSource };

/** Verification is supplementary: a failure never prevents joining. */
export async function verifyJoinSource(
  deps: Deps,
  communityId: string,
  source: JoinSource,
): Promise<JoinSource | null> {
  try {
    switch (source.via) {
      case "magazine":
        return await JOIN_SOURCE_VERIFIERS.magazine(deps, communityId, source);
    }
    const exhaustive: never = source.via;
    return exhaustive;
  } catch (error) {
    console.error("[communities] join source verification failed", {
      via: source.via,
      error,
    });
    return null;
  }
}

/** Activity metadata writer; keep its matching reader alongside it. */
export function joinSourceMetadata(
  source: JoinSource,
): Record<string, string | number> {
  switch (source.via) {
    case "magazine":
      return {
        via: "magazine",
        magazineId: source.magazineId,
        issueId: source.issueId,
      };
  }
  const exhaustive: never = source.via;
  return exhaustive;
}

/** The only SQL reader of join-source metadata. Values are parameters. */
export function joinSourceCondition(source: JoinSource): SQL {
  switch (source.via) {
    case "magazine":
      return sql`${activityEvents.metadata}->>'via' = ${source.via} AND ${activityEvents.metadata}->>'issueId' = ${String(source.issueId)}`;
  }
  const exhaustive: never = source.via;
  return exhaustive;
}
