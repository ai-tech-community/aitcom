import { and, asc, eq, isNotNull, isNull, max, ne, sql } from "drizzle-orm";

import {
  DEFAULT_AUTO_DRAFT_SETTINGS,
  resolveSources,
  type AutoDraftSettings,
  type AutoDraftSettingsInput,
} from "@/lib/magazines/auto-draft";
import { planVisibilityChange } from "@/lib/magazines/visibility";
import type { Magazine } from "@/payload-types";
import {
  communities,
  magazineAutoDraftRuns,
  magazineAutoDraftSettings,
} from "@/server/db/schema";

import type { Deps } from "../deps";
import { magazineError, magazineErrorCodeOf } from "../errors";
import { unscheduleIssue, type IssueActor } from "../issue-service";
import { findOpenAutoDraft } from "./runs";

export type StoredAutoDraftSettings = AutoDraftSettings & {
  scheduleStartsAt: Date | null;
  updatedBy: string | null;
};

function storedSettings({
  magazineId: _magazineId,
  createdAt: _createdAt,
  updatedAt: _updatedAt,
  ...settings
}: typeof magazineAutoDraftSettings.$inferSelect): StoredAutoDraftSettings {
  return {
    ...DEFAULT_AUTO_DRAFT_SETTINGS,
    ...settings,
    publicConfirmedAt: settings.publicConfirmedAt?.toISOString() ?? null,
    sources: resolveSources(settings.sources),
  };
}

/** The saved settings over the defaults, including defaults for new sources. */
export async function readAutoDraftSettings(
  db: Deps["db"],
  magazineId: number,
): Promise<StoredAutoDraftSettings> {
  const row = await db.query.magazineAutoDraftSettings.findFirst({
    where: eq(magazineAutoDraftSettings.magazineId, magazineId),
  });
  return row
    ? storedSettings(row)
    : {
        ...DEFAULT_AUTO_DRAFT_SETTINGS,
        sources: resolveSources(null),
        scheduleStartsAt: null,
        updatedBy: null,
      };
}

/** Saves the policy and stops only the open draft's automatic schedule. */
export async function saveAutoDraftSettings(
  deps: Deps,
  magazine: Magazine,
  input: AutoDraftSettingsInput,
  actor: IssueActor & { leadsCommunity: boolean },
  now = new Date(),
): Promise<StoredAutoDraftSettings> {
  const current = await readAutoDraftSettings(deps.db, magazine.id);
  let visibility: Pick<
    AutoDraftSettings,
    "visibility" | "publicConfirmedBy" | "publicConfirmedAt"
  > = { visibility: null, publicConfirmedBy: null, publicConfirmedAt: null };
  if (input.visibility !== null) {
    const plan = planVisibilityChange({
      next: input.visibility,
      current: {
        visibility: current.visibility ?? "members",
        publicConfirmedBy: current.publicConfirmedBy,
        publicConfirmedAt: current.publicConfirmedAt,
      },
      community: actor.community,
      confirmUnlistedPublic: input.confirmUnlistedPublic,
      actorId: actor.userId,
      actorLeadsCommunity: actor.leadsCommunity,
      now,
    });
    if (!plan.ok) throw magazineError(plan.code);
    visibility = plan.record;
  }
  const restartsSchedule =
    !current.enabled ||
    input.cadence !== current.cadence ||
    input.monthDay !== current.monthDay ||
    input.weekday !== current.weekday;
  const data = {
    enabled: input.enabled,
    cadence: input.cadence,
    monthDay: input.monthDay,
    weekday: input.weekday,
    lookBack: input.lookBack,
    layout: input.layout,
    neverReuse: input.neverReuse,
    whenReady: input.whenReady,
    autoPublishDays: input.autoPublishDays,
    ...visibility,
    publicConfirmedAt: visibility.publicConfirmedAt
      ? new Date(visibility.publicConfirmedAt)
      : null,
    sources: resolveSources(input.sources),
    scheduleStartsAt: input.enabled
      ? restartsSchedule
        ? now
        : current.scheduleStartsAt
      : null,
    updatedBy: actor.userId,
    updatedAt: now,
  };
  const [row] = await deps.db
    .insert(magazineAutoDraftSettings)
    .values({ ...data, magazineId: magazine.id })
    .onConflictDoUpdate({
      target: magazineAutoDraftSettings.magazineId,
      set: data,
    })
    .returning();
  const saved = storedSettings(row!);

  // Manual drafting also works while disabled, so enabled does not gate this.
  if (saved.whenReady === "notify") {
    const issue = await findOpenAutoDraft(deps, magazine.id);
    if (issue?.status === "scheduled" && issue.scheduledVia === "auto") {
      try {
        await unscheduleIssue(deps, issue, issue.updatedAt, actor);
      } catch (error) {
        const code = magazineErrorCodeOf(error);
        if (code !== "ISSUE_CHANGED" && code !== "ISSUE_NOT_SCHEDULED")
          throw error;
      }
    }
  }
  return saved;
}

export type DueAutoDraftSettings = StoredAutoDraftSettings & {
  magazineId: number;
  communityId: string;
  lastRunAt: Date | null;
};

/** Eligible magazines, giving those least recently tried the first turn. */
export async function listDueAutoDraftSettings(
  db: Deps["db"],
): Promise<DueAutoDraftSettings[]> {
  const latestRuns = db
    .select({
      magazineId: magazineAutoDraftRuns.magazineId,
      lastRunAt: max(magazineAutoDraftRuns.claimedAt).as("last_run_at"),
    })
    .from(magazineAutoDraftRuns)
    .groupBy(magazineAutoDraftRuns.magazineId)
    .as("latest_auto_run");
  const rows = await db
    .select({
      settings: magazineAutoDraftSettings,
      communityId: communities.id,
      lastRunAt: latestRuns.lastRunAt,
    })
    .from(magazineAutoDraftSettings)
    .innerJoin(
      sql`"public"."magazines" AS "magazine"`,
      sql`"magazine"."id" = ${magazineAutoDraftSettings.magazineId}`,
    )
    .innerJoin(communities, sql`${communities.id} = "magazine"."community_id"`)
    .leftJoin(
      latestRuns,
      eq(latestRuns.magazineId, magazineAutoDraftSettings.magazineId),
    )
    .where(
      and(
        eq(magazineAutoDraftSettings.enabled, true),
        ne(magazineAutoDraftSettings.cadence, "on_demand"),
        isNotNull(magazineAutoDraftSettings.scheduleStartsAt),
        isNotNull(magazineAutoDraftSettings.updatedBy),
        isNull(communities.deletedAt),
      ),
    )
    .orderBy(
      sql`${latestRuns.lastRunAt} ASC NULLS FIRST`,
      asc(magazineAutoDraftSettings.magazineId),
    );
  return rows.map(({ settings, communityId, lastRunAt }) => ({
    ...storedSettings(settings),
    magazineId: settings.magazineId,
    communityId,
    lastRunAt,
  }));
}

export async function autoPublishAllowed(
  db: Deps["db"],
  magazineId: number,
): Promise<boolean> {
  const settings = await db.query.magazineAutoDraftSettings.findFirst({
    where: eq(magazineAutoDraftSettings.magazineId, magazineId),
    columns: { whenReady: true },
  });
  return settings?.whenReady === "auto_publish";
}
