import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { routing } from "@/i18n/routing";
import {
  AUTO_DRAFT_MIN_ITEMS,
  AUTO_DRAFT_SOURCE_ORDER,
  AUTO_DRAFT_SOURCES,
} from "@/lib/magazines/auto-draft";
import {
  calendarPeriod,
  isPeriodDue,
} from "@/lib/magazines/auto-draft-schedule";
import type {
  AutoDraftSkipReason,
  AutoDraftTrigger,
} from "@/lib/magazines/issue-history";
import type { SuggestionReason } from "@/lib/magazines/suggestions";
import type { Magazine, MagazineIssue } from "@/payload-types";
import { communities } from "@/server/db/schema";

import type { Deps } from "../deps";
import {
  listMagazineEditorIds,
  loadMagazineEditorship,
  standingCan,
} from "../editorship";
import { recordIssueHistory } from "../issue-history";
import {
  createIssue,
  deleteDraftIssue,
  scheduleIssue,
  setIssueItems,
  unscheduleIssue,
  type IssueActor,
} from "../issue-service";
import { itemContextFor, suggestContextFor } from "../items/context";
import {
  referencesOfBlocks,
  toStoredItems,
  validateIssueItems,
  type IssueItemInput,
  type StoredBlock,
} from "../items/registry";
import { suggestCandidates } from "../items/suggesters";
import type { MagazineCommunity } from "../magazine-service";
import { notifyAutoDraftReady, notifyAutoDraftSkipped } from "../notifications";
import { inPayloadTransaction } from "../payload-writes";
import { saveAutoPicks } from "./picks";
import {
  attachRunIssue,
  claimAutoDraftRun,
  findOpenAutoDraft,
  finishedPeriodKeys,
  finishAutoDraftRun,
  pendingEventPeriods,
} from "./runs";
import { listDueAutoDraftSettings, readAutoDraftSettings } from "./settings";
import { suggestWindowFor } from "./window";

export const AUTO_DRAFT_RUNS_PER_PASS = 5;
// Keep automatic drafts editable through the builder's 50-item save limit.
const AUTO_DRAFT_ITEM_LIMIT = 50;
export type AutoDraftOutcome =
  | {
      status: "made";
      issueId: number;
      itemCount: number;
      goesOutAt: string | null;
    }
  | {
      status: "skipped";
      reason: AutoDraftSkipReason;
      found: number | null;
      needed: number | null;
      openIssueId: number | null;
    }
  | { status: "already_ran" }
  | { status: "busy" };

type DraftInput = {
  magazine: Magazine;
  community: MagazineCommunity & { name: string };
  periodKey: string;
  trigger: AutoDraftTrigger;
  actingUserId: string | null;
  requestedBy: string | null;
  now: Date;
};

function madeOutcome(
  issue: MagazineIssue,
): Extract<AutoDraftOutcome, { status: "made" }> {
  return {
    status: "made",
    issueId: issue.id,
    itemCount: issue.items?.length ?? 0,
    goesOutAt:
      issue.status === "scheduled" ? (issue.scheduledFor ?? null) : null,
  };
}

/** One claimed attempt. Issue writes always use the ordinary issue service. */
export async function makeAutoDraft(
  deps: Deps,
  input: DraftInput,
): Promise<AutoDraftOutcome> {
  return attemptAutoDraft(deps, input);
}

/** The pass counts the claim itself, including an attempt that later fails. */
async function attemptAutoDraft(
  deps: Deps,
  input: DraftInput,
  onClaim?: () => void,
): Promise<AutoDraftOutcome> {
  const { magazine, community, now, trigger } = input;
  const claim = await claimAutoDraftRun(deps.db, {
    magazineId: magazine.id,
    periodKey: input.periodKey,
    trigger,
    requestedBy: input.requestedBy,
    now,
  });
  if ("refused" in claim) return { status: claim.refused };
  onClaim?.();
  const { runId } = claim;
  const magazineRef = { magazineId: magazine.id, communityId: community.id };
  const actorId = trigger === "manual" ? input.requestedBy : null;
  const history = async (
    issue: MagazineIssue | null,
    detail: Parameters<typeof recordIssueHistory>[1]["detail"],
  ): Promise<void> => {
    // The run is already terminal. A follow-up failure must never invite a
    // retry to delete a completed draft or repeat a finished skip.
    try {
      // Use the transaction clock, like issue-service history, for one chronology.
      await inPayloadTransaction(deps.payload, (tx) =>
        recordIssueHistory(tx, {
          magazineId: magazine.id,
          issue: issue
            ? {
                id: issue.id,
                number: Number(issue.number),
                title: issue.title,
              }
            : null,
          actorId,
          detail,
        }),
      );
    } catch (error) {
      console.error("[magazines] automatic draft history failed", {
        magazineId: magazine.id,
        error,
      });
    }
  };
  const skip = async (
    reason: AutoDraftSkipReason,
    found: number | null = null,
    openIssueId: number | null = null,
  ): Promise<AutoDraftOutcome> => {
    const needed = reason === "too_few" ? AUTO_DRAFT_MIN_ITEMS : null;
    await finishAutoDraftRun(
      deps.db,
      runId,
      { status: "skipped", reason, found },
      now,
    );
    await history(null, {
      event: "draft_skipped",
      trigger,
      reason,
      found,
      needed,
    });
    if (trigger !== "manual" && reason !== "draft_open") {
      try {
        await notifyAutoDraftSkipped(deps.db, {
          editorIds: await listMagazineEditorIds(deps.db, magazineRef),
          magazineName: magazine.name,
          reason,
          found,
          needed,
          community,
        });
      } catch (error) {
        console.error("[magazines] automatic draft notice failed", {
          magazineId: magazine.id,
          error,
        });
      }
    }
    return { status: "skipped", reason, found, needed, openIssueId };
  };

  try {
    if (claim.leftoverIssueId !== null) {
      let leftover = await deps.payload.findByID({
        collection: "magazine-issues",
        id: claim.leftoverIssueId,
        depth: 0,
        disableErrors: true,
      });
      if (leftover) {
        // Cleanup has no person or permission decision; via:auto writes no deletion history.
        const cleanupActor: IssueActor = {
          userId: input.actingUserId ?? "",
          community,
          via: "auto",
        };
        if (
          leftover.status === "scheduled" &&
          leftover.scheduledVia === "auto"
        ) {
          leftover = await unscheduleIssue(
            deps,
            leftover,
            leftover.updatedAt,
            cleanupActor,
          );
        }
        if (leftover.status === "draft") {
          await deleteDraftIssue(deps, leftover, cleanupActor);
        } else {
          await finishAutoDraftRun(
            deps.db,
            runId,
            { status: "made", issueId: leftover.id },
            now,
          );
          return madeOutcome(leftover);
        }
      }
    }

    const standing = await loadMagazineEditorship(
      deps.db,
      magazineRef,
      input.actingUserId,
    );
    if (input.actingUserId === null || !standingCan(standing, "edit"))
      return await skip("no_rights");
    const actor: IssueActor = {
      userId: input.actingUserId,
      community,
      via: "auto",
    };
    const open = await findOpenAutoDraft(deps, magazine.id);
    if (open) return await skip("draft_open", null, open.id);

    const settings = await readAutoDraftSettings(deps.db, magazine.id);
    const window = await suggestWindowFor(
      deps,
      magazine.id,
      settings.lookBack,
      now,
    );
    const ctx = suggestContextFor(deps, {
      magazine,
      community,
      viewerId: input.actingUserId,
      locale: routing.defaultLocale,
      now,
    });
    const validationCtx = itemContextFor(deps, {
      magazineId: magazine.id,
      community,
      viewerId: ctx.viewerId,
      locale: ctx.locale,
      issueId: null,
      access: "editor",
    });
    const exclude: string[] = [];
    if (settings.neverReuse) {
      const { docs } = await deps.payload.find({
        collection: "magazine-issues",
        where: { magazine: { equals: magazine.id } },
        depth: 0,
        pagination: false,
      });
      for (const issue of docs)
        exclude.push(
          ...referencesOfBlocks((issue.items ?? []) as StoredBlock[]),
        );
    }
    const picked: { input: IssueItemInput; reason: SuggestionReason }[] = [];
    let found = 0;
    for (const source of AUTO_DRAFT_SOURCE_ORDER) {
      if (picked.length >= AUTO_DRAFT_ITEM_LIMIT) break;
      const config = settings.sources[source];
      if (!config.enabled) continue;
      const candidates = await suggestCandidates(source, ctx, window, {
        limit: config.max,
        exclude,
      });
      const blocks = toStoredItems(
        candidates.map((candidate) => candidate.input),
      );
      const problems = await validateIssueItems(blocks, validationCtx);
      const invalid = new Set(problems.map((problem) => problem.itemIndex));
      for (const [index, candidate] of candidates.entries()) {
        if (picked.length >= AUTO_DRAFT_ITEM_LIMIT) break;
        if (
          invalid.has(index) ||
          (candidate.reference !== null &&
            exclude.includes(candidate.reference))
        )
          continue;
        picked.push({ input: candidate.input, reason: candidate.reason });
        if (candidate.reference !== null) exclude.push(candidate.reference);
        if (AUTO_DRAFT_SOURCES[source].countsTowardMinimum) found++;
      }
    }
    if (found < AUTO_DRAFT_MIN_ITEMS) return await skip("too_few", found);

    const t = await getTranslations({
      locale: routing.defaultLocale,
      namespace: "magazineEditor.autoDraft",
    });
    const title = t("issueTitle", {
      date: new Intl.DateTimeFormat("en-GB", {
        dateStyle: "long",
        timeZone: "Europe/Amsterdam",
      }).format(now),
    });
    const created = await createIssue(deps, magazine, { title }, actor, {
      layout: settings.layout,
      ...(settings.visibility === null
        ? {}
        : {
            visibility: {
              visibility: settings.visibility,
              publicConfirmedBy: settings.publicConfirmedBy,
              publicConfirmedAt: settings.publicConfirmedAt,
            },
          }),
    });
    let saved: MagazineIssue;
    try {
      await attachRunIssue(deps.db, runId, created.id);
      saved = (
        await setIssueItems(
          deps,
          created,
          picked.map((pick) => pick.input),
          created.updatedAt,
          actor,
        )
      ).issue;
      await saveAutoPicks(
        deps.db,
        saved.id,
        (saved.items ?? []).map((item, index) => ({
          itemId: item.id!,
          reason: picked[index]!.reason,
        })),
      );
    } catch (error) {
      await deleteDraftIssue(deps, created, actor);
      throw error;
    }
    if (settings.whenReady === "auto_publish") {
      try {
        saved = await scheduleIssue(
          deps,
          saved,
          new Date(now.getTime() + settings.autoPublishDays * 86_400_000),
          saved.updatedAt,
          actor,
          now,
          { via: "auto" },
        );
      } catch (error) {
        console.error("[magazines] automatic draft schedule failed", {
          magazineId: magazine.id,
          error,
        });
      }
    }
    const outcome = madeOutcome(saved);
    await finishAutoDraftRun(
      deps.db,
      runId,
      { status: "made", issueId: saved.id },
      now,
    );
    await history(saved, {
      event: "draft_made",
      trigger,
      itemCount: outcome.itemCount,
      goesOutAt: outcome.goesOutAt,
    });
    try {
      await notifyAutoDraftReady(deps.db, {
        editorIds: await listMagazineEditorIds(deps.db, magazineRef),
        magazineName: magazine.name,
        issue: saved,
        itemCount: outcome.itemCount,
        goesOutAt: outcome.goesOutAt,
        community,
      });
    } catch (error) {
      console.error("[magazines] automatic draft notice failed", {
        magazineId: magazine.id,
        error,
      });
    }
    return outcome;
  } catch (error) {
    await finishAutoDraftRun(deps.db, runId, { status: "failed" }, now);
    throw error;
  }
}

/** Finished or busy periods do not use the pass's five-claim budget. */
export async function runDueAutoDrafts(
  deps: Deps,
  now: Date,
): Promise<{ drafted: number; skipped: number }> {
  const result = { drafted: 0, skipped: 0 };
  let claims = 0;
  for (const settings of await listDueAutoDraftSettings(deps.db)) {
    if (claims >= AUTO_DRAFT_RUNS_PER_PASS) break;
    try {
      const community = await deps.db.query.communities.findFirst({
        where: eq(communities.id, settings.communityId),
      });
      if (!community) continue;
      const magazine = await deps.payload.findByID({
        collection: "magazines",
        id: settings.magazineId,
        depth: 0,
        disableErrors: true,
      });
      if (!magazine) continue;
      const period = calendarPeriod(settings, now);
      const keys =
        settings.cadence === "after_event"
          ? await pendingEventPeriods(deps, {
              magazineId: magazine.id,
              community,
              scheduleStartsAt: settings.scheduleStartsAt!,
              now,
            })
          : period && isPeriodDue(period, now, settings.scheduleStartsAt)
            ? [period.key]
            : [];
      const finished = await finishedPeriodKeys(deps.db, magazine.id, keys);
      for (const periodKey of keys) {
        if (claims >= AUTO_DRAFT_RUNS_PER_PASS) break;
        if (finished.has(periodKey)) continue;
        try {
          const outcome = await attemptAutoDraft(
            deps,
            {
              magazine,
              community,
              periodKey,
              trigger:
                settings.cadence === "after_event" ? "event" : "schedule",
              actingUserId: settings.updatedBy,
              requestedBy: null,
              now,
            },
            () => {
              claims++;
            },
          );
          if (outcome.status === "already_ran" || outcome.status === "busy")
            continue;
          if (outcome.status === "made") result.drafted++;
          else result.skipped++;
        } catch (error) {
          // Acquired claims were counted before the work, even when it failed.
          console.error("[magazines] automatic draft failed", {
            magazineId: magazine.id,
            error,
          });
        }
      }
    } catch (error) {
      console.error("[magazines] automatic draft failed", {
        magazineId: settings.magazineId,
        error,
      });
    }
  }
  return result;
}
