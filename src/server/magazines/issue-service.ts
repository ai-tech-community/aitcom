import { sql } from "@payloadcms/db-postgres";

import { routing } from "@/i18n/routing";
import type { ScheduleFailure } from "@/lib/magazines/issue-history";
import {
  ITEM_PROBLEM_CODES,
  type EditorItemView,
  type ItemProblem,
} from "@/lib/magazines/item-views";
import { scheduleProblem } from "@/lib/magazines/schedule";
import {
  canIssue,
  type IssueLayout,
  type IssueVisibility,
  type PublishOrigin,
  type ScheduleOrigin,
} from "@/lib/magazines/values";
import {
  planVisibilityChange,
  type VisibilityRecord,
} from "@/lib/magazines/visibility";
import { slugify } from "@/lib/text-utils";
import type { Magazine, MagazineIssue } from "@/payload-types";

import {
  deliverInboxAnnouncement,
  recordIssueAnnouncement,
} from "./announcements";
import {
  clearArticlePlacement,
  placedArticlesOf,
  syncArticlePlacement,
} from "./article-placement";
import {
  creditPendingMagazineArticles,
  publishPlacedArticles,
} from "./article-publication";
import type { Deps, PayloadClient } from "./deps";
import { magazineError, type MagazineErrorCode } from "./errors";
import { recordIssueHistory, type HistoryWrite } from "./issue-history";
import { itemContextFor } from "./items/context";
import {
  type IssueItemInput,
  type StoredBlock,
  loadIssueItemViews,
  toStoredItems,
  validateIssueItems,
} from "./items/registry";
import type { ItemContext } from "./items/types";
import {
  inPayloadTransaction,
  isConcurrencyAbort,
  type PayloadTransaction,
  uniqueViolationPath,
} from "./payload-writes";
import type { MagazineCommunity } from "./magazine-service";
import { requireRelationId } from "./relation-id";

/** Who is writing, and the community the issue belongs to. */
export type IssueActor = {
  userId: string;
  community: MagazineCommunity;
  /** The auto-drafter acting with this person's rights. */
  via?: "auto";
};

const CLEARED_SCHEDULE = {
  scheduledFor: null,
  scheduledBy: null,
  scheduledVia: null,
} as const;

function historyActorId(actor: IssueActor | null): string | null {
  return actor === null || actor.via === "auto" ? null : actor.userId;
}

function stopsAutomaticSchedule(
  issue: MagazineIssue,
  actor: IssueActor,
): boolean {
  return (
    actor.via !== "auto" &&
    issue.status === "scheduled" &&
    issue.scheduledVia === "auto" &&
    canIssue(issue.status, "unschedule")
  );
}

function historySnapshot(
  issue: MagazineIssue,
): Pick<HistoryWrite, "magazineId" | "issue"> {
  return {
    magazineId: requireRelationId(issue.magazine),
    issue: { id: issue.id, number: Number(issue.number), title: issue.title },
  };
}

export type IssueDetailsPatch = {
  title?: string;
  slug?: string;
  coverImageUrl?: string | null;
  editorNote?: unknown;
  visibility?: IssueVisibility;
  confirmUnlistedPublic?: boolean;
};

/** Issue slugs follow the magazine slug rule: 3–60 characters. */
const ISSUE_SLUG_MIN = 3;
const ISSUE_SLUG_MAX = 60;

/**
 * Attempts at creating an issue when another editor takes the number or
 * the generated slug first.
 */
const CREATE_ATTEMPTS = 5;

/** Generated slug candidates checked in one query. */
const SLUG_CANDIDATES = 25;

function storedBlocksOf(issue: MagazineIssue): StoredBlock[] {
  return (issue.items ?? []) as StoredBlock[];
}

// ── Compare-and-set (preflight F21) ─────────────────────────────────────

function instant(value: string): number {
  return new Date(value).getTime();
}

/**
 * The cheap early refusal: the editor's copy is older than the issue the
 * caller loaded. Compares instants, not strings.
 */
function assertFresh(issue: MagazineIssue, expectedUpdatedAt: string): void {
  const expected = instant(expectedUpdatedAt);
  if (Number.isNaN(expected) || expected !== instant(issue.updatedAt)) {
    throw magazineError("ISSUE_CHANGED");
  }
}

/**
 * Runs `write` in a transaction that first claims the issue row with a
 * conditional UPDATE on `updated_at`. The claim locks the row, so of two
 * saves made from the same `expectedUpdatedAt` the second waits, then
 * finds the time moved and gets `ISSUE_CHANGED`: nothing is overwritten.
 * A save Postgres aborts for a concurrent one (a deadlock between two saves
 * reshuffling the same articles) is also `ISSUE_CHANGED`: the builder
 * reloads and the editor saves again.
 */
async function writeIssue(
  deps: Deps,
  issue: MagazineIssue,
  expectedUpdatedAt: string,
  write: (tx: PayloadTransaction) => Promise<MagazineIssue>,
): Promise<MagazineIssue> {
  assertFresh(issue, expectedUpdatedAt);
  const expected = new Date(expectedUpdatedAt).toISOString();
  try {
    return await inPayloadTransaction(deps.payload, async (tx) => {
      const claimed = await tx.execute(sql`
        UPDATE "magazine_issues" SET "updated_at" = "updated_at"
        WHERE "id" = ${issue.id} AND "updated_at" = ${expected}::timestamptz
        RETURNING "id"
      `);
      if (claimed.length === 0) throw magazineError("ISSUE_CHANGED");
      return write(tx);
    });
  } catch (error) {
    throw mapIssueWriteError(error);
  }
}

/** A unique-index violation or concurrency abort, as a magazine refusal. */
function mapIssueWriteError(error: unknown): unknown {
  if (isConcurrencyAbort(error)) return magazineError("ISSUE_CHANGED");
  const path = uniqueViolationPath(error);
  if (path !== null && /\bslug\b/.test(path)) {
    return magazineError("ISSUE_SLUG_TAKEN");
  }
  return error;
}

/** A clash on the issue number or slug that `createIssue` picked itself. */
function isGeneratedValueTaken(error: unknown): boolean {
  const path = uniqueViolationPath(error);
  return path !== null && /\b(number|slug)\b/.test(path);
}

// ── Items ───────────────────────────────────────────────────────────────

/**
 * Keeps a client-sent block id only when it names one of THIS issue's
 * saved blocks of the same kind, the first time it appears. Any other id
 * (another issue's, a repeat, an invented one) is dropped so Payload mints
 * a fresh one: block ids are primary keys shared by every issue.
 */
function keepOwnBlockIds(
  items: IssueItemInput[],
  current: StoredBlock[],
): IssueItemInput[] {
  const own = new Map(
    current.flatMap((block) =>
      block.id ? [[block.id, block.blockType] as const] : [],
    ),
  );
  const used = new Set<string>();
  return items.map((item) => {
    if (!item.id) return item;
    if (own.get(item.id) === item.kind && !used.has(item.id)) {
      used.add(item.id);
      return item;
    }
    return { ...item, id: undefined };
  });
}

/** `T`, accepted only when it is a subset of `U`. */
type Subset<T extends U, U> = T;

/**
 * Compile-time check: every `ItemProblem` code is a magazine refusal code
 * the client can translate. Adding a problem code that is not in
 * `MAGAZINE_ERROR_CODES` fails the build here.
 */
export type ItemProblemCode = Subset<ItemProblem["code"], MagazineErrorCode>;

export function isItemProblemCode(
  code: MagazineErrorCode,
): code is ItemProblemCode {
  return (ITEM_PROBLEM_CODES as readonly MagazineErrorCode[]).includes(code);
}

/** An item problem as a refusal, pointing at the item. */
function problemError(problem: ItemProblem) {
  return magazineError(problem.code, { itemIndex: problem.itemIndex });
}

async function assertItemsValid(
  deps: Deps,
  issue: MagazineIssue,
  blocks: StoredBlock[],
  actor: IssueActor,
): Promise<ItemContext> {
  const ctx = itemContextFor(deps, {
    magazineId: requireRelationId(issue.magazine),
    community: actor.community,
    issueId: issue.id,
    // The editor API always reads in the default locale.
    locale: routing.defaultLocale,
    access: "editor",
    viewerId: actor.userId,
  });
  const [problem] = await validateIssueItems(
    blocks,
    ctx,
    storedBlocksOf(issue),
  );
  if (problem) throw problemError(problem);
  return ctx;
}

/** Scheduling and publishing validate the same saved content. */
async function assertPublishable(
  deps: Deps,
  issue: MagazineIssue,
  actor: IssueActor,
): Promise<void> {
  const blocks = storedBlocksOf(issue);
  if (blocks.length === 0) throw magazineError("ISSUE_EMPTY");
  await assertItemsValid(deps, issue, blocks, actor);
}

/** Follow-up work cannot fail a publish that has already committed. */
async function afterIssuePublished(
  deps: Deps,
  published: MagazineIssue,
): Promise<void> {
  try {
    await creditPendingMagazineArticles(
      deps,
      requireRelationId(published.magazine),
    );
  } catch (error) {
    console.error("[magazines] credit after publish failed", {
      issueId: published.id,
      error,
    });
  }
  try {
    await deliverInboxAnnouncement(deps, published.id);
  } catch (error) {
    console.error("[magazines] inbox announcement failed", {
      issueId: published.id,
      error,
    });
  }
}

function articleIdsOf(blocks: StoredBlock[]): number[] {
  return placedArticlesOf(blocks).map((a) => a.articleId);
}

// ── Services ────────────────────────────────────────────────────────────

/** An issue slug from its title; `issue-<number>` when the title has none. */
export function issueSlugFor(title: string, number: number): string {
  const slug = slugify(title).slice(0, ISSUE_SLUG_MAX).replace(/-+$/, "");
  return slug.length >= ISSUE_SLUG_MIN ? slug : `issue-${number}`;
}

async function nextIssueNumber(
  payload: PayloadClient,
  magazineId: number,
): Promise<number> {
  const { docs } = await payload.find({
    collection: "magazine-issues",
    where: { magazine: { equals: magazineId } },
    sort: "-number",
    depth: 0,
    limit: 1,
    pagination: false,
  });
  // Payload numbers can come back as strings.
  return docs[0] ? Number(docs[0].number) + 1 : 1;
}

/** `base` with `-<suffix>`, cut so the whole slug stays within the limit. */
function withSuffix(base: string, suffix: string): string {
  const cut = base.slice(0, ISSUE_SLUG_MAX - suffix.length - 1);
  return `${cut.replace(/-+$/, "")}-${suffix}`;
}

/**
 * The slugs `createIssue` may give an issue, best first: the title slug,
 * then `-<number>`, then `-<number>-2`, `-<number>-3`, …
 */
export function issueSlugCandidates(
  title: string,
  number: number,
  count = SLUG_CANDIDATES,
): string[] {
  const base = issueSlugFor(title, number);
  const candidates = [base, withSuffix(base, String(number))];
  for (let k = 2; candidates.length < count; k++) {
    candidates.push(withSuffix(base, `${number}-${k}`));
  }
  return candidates;
}

/** The first candidate slug no issue of the magazine uses (one query). */
async function freeIssueSlug(
  payload: PayloadClient,
  magazineId: number,
  title: string,
  number: number,
): Promise<string> {
  const candidates = issueSlugCandidates(title, number);
  const { docs } = await payload.find({
    collection: "magazine-issues",
    where: {
      and: [{ magazine: { equals: magazineId } }, { slug: { in: candidates } }],
    },
    select: { slug: true },
    depth: 0,
    limit: candidates.length,
    pagination: false,
  });
  const taken = new Set(docs.map((doc) => doc.slug));
  const free = candidates.find((slug) => !taken.has(slug));
  // Every candidate taken: the number suffix with the time is still unique.
  return (
    free ?? withSuffix(candidates[0]!, `${number}-${Date.now().toString(36)}`)
  );
}

/**
 * Creates the magazine's next issue as a draft: numbered after the highest
 * existing one, slugged from its title, with the magazine's default
 * visibility and its unlisted-public confirmation copied in unless a
 * previously confirmed visibility record is supplied. The number and
 * the slug are picked here, never typed, so a clash with a concurrent
 * create picks the next free ones instead of refusing.
 */
export async function createIssue(
  deps: Deps,
  magazine: Magazine,
  input: { title: string },
  // Creation copies an already-confirmed visibility record, so it needs
  // no actor decision.
  _actor: IssueActor,
  opts?: { layout?: IssueLayout; visibility?: VisibilityRecord },
): Promise<MagazineIssue> {
  const visibility = magazine.defaultVisibility ?? "members";
  const visibilityRecord = opts?.visibility ?? {
    visibility,
    publicConfirmedBy:
      visibility === "public" ? (magazine.publicConfirmedBy ?? null) : null,
    publicConfirmedAt:
      visibility === "public" ? (magazine.publicConfirmedAt ?? null) : null,
  };
  for (let attempt = 1; ; attempt++) {
    const number = await nextIssueNumber(deps.payload, magazine.id);
    const slug = await freeIssueSlug(
      deps.payload,
      magazine.id,
      input.title,
      number,
    );
    try {
      return await deps.payload.create({
        collection: "magazine-issues",
        data: {
          magazine: magazine.id,
          communityId: magazine.communityId,
          number,
          title: input.title,
          slug,
          status: "draft",
          layout: opts?.layout ?? "cover-story",
          ...visibilityRecord,
          items: [],
        },
        depth: 0,
      });
    } catch (error) {
      // Another editor created an issue between our reads and our insert.
      if (isGeneratedValueTaken(error) && attempt < CREATE_ATTEMPTS) continue;
      throw mapIssueWriteError(error);
    }
  }
}

/**
 * Edits an issue's details. The slug locks once the issue is published
 * (links must not break); visibility goes through `planVisibilityChange`.
 */
export async function updateIssueDetails(
  deps: Deps,
  issue: MagazineIssue,
  patch: IssueDetailsPatch,
  expectedUpdatedAt: string,
  actor: IssueActor,
  actorLeadsCommunity: boolean,
): Promise<MagazineIssue> {
  assertFresh(issue, expectedUpdatedAt);

  const data: Partial<MagazineIssue> = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.slug !== undefined && patch.slug !== issue.slug) {
    if (issue.status === "published") throw magazineError("ISSUE_SLUG_LOCKED");
    data.slug = patch.slug;
  }
  if (patch.coverImageUrl !== undefined) {
    data.coverImageUrl = patch.coverImageUrl;
  }
  if (patch.editorNote !== undefined) {
    data.editorNote = patch.editorNote as MagazineIssue["editorNote"];
  }
  if (patch.visibility !== undefined || patch.confirmUnlistedPublic) {
    const plan = planVisibilityChange({
      next: patch.visibility ?? issue.visibility,
      current: {
        visibility: issue.visibility,
        publicConfirmedBy: issue.publicConfirmedBy ?? null,
        publicConfirmedAt: issue.publicConfirmedAt ?? null,
      },
      community: actor.community,
      confirmUnlistedPublic: patch.confirmUnlistedPublic ?? false,
      actorId: actor.userId,
      actorLeadsCommunity,
      now: new Date(),
    });
    if (!plan.ok) throw magazineError(plan.code);
    Object.assign(data, plan.record);
  }

  const stopAutomatic = stopsAutomaticSchedule(issue, actor);
  if (stopAutomatic)
    Object.assign(data, { status: "draft", ...CLEARED_SCHEDULE });
  const saved = await writeIssue(deps, issue, expectedUpdatedAt, async (tx) => {
    const written = await deps.payload.update({
      collection: "magazine-issues",
      id: issue.id,
      data,
      depth: 0,
      req: tx.req,
    });
    if (stopAutomatic) {
      await recordIssueHistory(tx, {
        ...historySnapshot(written),
        actorId: historyActorId(actor),
        detail: { event: "auto_publish_stopped", why: "edited" },
      });
    }
    return written;
  });
  // Every save of a published issue retries the magazine's pending credits.
  if (saved.status === "published") {
    await creditPendingMagazineArticles(
      deps,
      requireRelationId(saved.magazine),
    );
  }
  return saved;
}

/**
 * Saves an issue's item list and syncs article placement with it, in one
 * transaction. Every problem refuses the save with the problem's code and
 * item index. In an already published issue, articles that are not yet
 * published are published in the same transaction, and pending credits
 * are settled after it commits (which also retries a credit that failed
 * before).
 */
export async function setIssueItems(
  deps: Deps,
  issue: MagazineIssue,
  items: IssueItemInput[],
  expectedUpdatedAt: string,
  actor: IssueActor,
): Promise<{ issue: MagazineIssue; items: EditorItemView[] }> {
  assertFresh(issue, expectedUpdatedAt);
  const blocks = toStoredItems(keepOwnBlockIds(items, storedBlocksOf(issue)));
  const ctx = await assertItemsValid(deps, issue, blocks, actor);
  const stopAutomatic = stopsAutomaticSchedule(issue, actor);

  const saved = await writeIssue(deps, issue, expectedUpdatedAt, async (tx) => {
    await syncArticlePlacement(
      deps.payload,
      tx,
      issue.id,
      placedArticlesOf(blocks),
    );
    // The claim makes `issue.status` the stored status.
    if (issue.status === "published") {
      await publishPlacedArticles(deps, articleIdsOf(blocks), tx);
    }
    const written = await deps.payload.update({
      collection: "magazine-issues",
      id: issue.id,
      data: {
        items: blocks as MagazineIssue["items"],
        ...(stopAutomatic ? { status: "draft", ...CLEARED_SCHEDULE } : {}),
      },
      depth: 0,
      req: tx.req,
    });
    if (actor.via !== "auto") {
      await recordIssueHistory(tx, {
        ...historySnapshot(written),
        actorId: historyActorId(actor),
        detail: {
          event: "items_changed",
          itemCount: written.items?.length ?? 0,
        },
      });
    }
    if (stopAutomatic) {
      await recordIssueHistory(tx, {
        ...historySnapshot(written),
        actorId: historyActorId(actor),
        detail: { event: "auto_publish_stopped", why: "edited" },
      });
    }
    return written;
  });

  if (saved.status === "published") {
    await creditPendingMagazineArticles(
      deps,
      requireRelationId(saved.magazine),
    );
  }
  return {
    issue: saved,
    items: await loadIssueItemViews(storedBlocksOf(saved), ctx),
  };
}

/** Checks the time before publish validation, then schedules a draft or reschedules. */
export async function scheduleIssue(
  deps: Deps,
  issue: MagazineIssue,
  publishAt: Date,
  expectedUpdatedAt: string,
  actor: IssueActor,
  now: Date = new Date(),
  opts?: { via?: ScheduleOrigin },
): Promise<MagazineIssue> {
  if (!canIssue(issue.status, "schedule"))
    throw magazineError("ISSUE_NOT_DRAFT");
  const problem = scheduleProblem(publishAt, now);
  if (problem) throw magazineError(problem);
  await assertPublishable(deps, issue, actor);
  return writeIssue(deps, issue, expectedUpdatedAt, (tx) =>
    deps.payload.update({
      collection: "magazine-issues",
      id: issue.id,
      data: {
        status: "scheduled",
        scheduledFor: publishAt.toISOString(),
        scheduledBy: actor.userId,
        scheduledVia: opts?.via ?? "schedule",
      },
      depth: 0,
      req: tx.req,
    }),
  );
}

/** Stops a schedule, preserving any newer editor save through the usual claim. */
export async function unscheduleIssue(
  deps: Deps,
  issue: MagazineIssue,
  expectedUpdatedAt: string,
  actor: IssueActor | null,
  opts?: { failure?: ScheduleFailure },
): Promise<MagazineIssue> {
  if (!canIssue(issue.status, "unschedule"))
    throw magazineError("ISSUE_NOT_SCHEDULED");
  return writeIssue(deps, issue, expectedUpdatedAt, async (tx) => {
    const written = await deps.payload.update({
      collection: "magazine-issues",
      id: issue.id,
      data: { status: "draft", ...CLEARED_SCHEDULE },
      depth: 0,
      req: tx.req,
    });
    if (issue.scheduledVia === "auto") {
      await recordIssueHistory(tx, {
        ...historySnapshot(written),
        actorId: historyActorId(actor),
        detail: opts?.failure
          ? {
              event: "auto_publish_stopped",
              why: "failed",
              failure: opts.failure,
            }
          : { event: "auto_publish_stopped", why: "stopped" },
      });
    }
    return written;
  });
}

/**
 * Publishes a draft or scheduled issue. Refuses an empty issue and any item problem.
 * The articles and the issue are published in ONE transaction, on the
 * claimed issue's connection: either all of it lands or none of it does,
 * and a concurrent second publish waits on the claim and gets
 * `ISSUE_CHANGED`. Authors are credited after the commit; a credit failure
 * never fails the publish (it stays pending, and the next publish or save
 * of a published issue of the same magazine retries it).
 */
export async function publishIssue(
  deps: Deps,
  issue: MagazineIssue,
  expectedUpdatedAt: string,
  actor: IssueActor,
  opts: { origin?: PublishOrigin; now?: Date } = {},
): Promise<MagazineIssue> {
  if (!canIssue(issue.status, "publish"))
    throw magazineError("ISSUE_NOT_DRAFT");
  assertFresh(issue, expectedUpdatedAt);
  await assertPublishable(deps, issue, actor);
  const blocks = storedBlocksOf(issue);
  const publishedAt = (opts.now ?? new Date()).toISOString();
  const origin = opts.origin ?? "button";

  const published = await writeIssue(
    deps,
    issue,
    expectedUpdatedAt,
    async (tx) => {
      await publishPlacedArticles(deps, articleIdsOf(blocks), tx);
      const saved = await deps.payload.update({
        collection: "magazine-issues",
        id: issue.id,
        data: {
          status: "published",
          publishedAt,
          publishedBy: actor.userId,
          publishedVia: origin,
          ...CLEARED_SCHEDULE,
        },
        depth: 0,
        req: tx.req,
      });
      await recordIssueHistory(tx, {
        ...historySnapshot(saved),
        actorId: origin === "auto" ? null : historyActorId(actor),
        detail: { event: "published", origin },
      });
      await recordIssueAnnouncement(tx, {
        issueId: saved.id,
        magazineId: requireRelationId(saved.magazine),
        publishedAt,
      });
      return saved;
    },
  );

  await afterIssuePublished(deps, published);
  return published;
}

/**
 * Deletes a draft issue and clears its articles' placement. A scheduled or
 * published issue cannot be deleted (`ISSUE_NOT_DRAFT`); the check runs on the locked
 * row, so a publish that lands first wins.
 */
export async function deleteDraftIssue(
  deps: Deps,
  issue: MagazineIssue,
  actor: IssueActor,
): Promise<void> {
  if (!canIssue(issue.status, "delete")) throw magazineError("ISSUE_NOT_DRAFT");
  await inPayloadTransaction(deps.payload, async (tx) => {
    const claimed = await tx.execute(sql`
      UPDATE "magazine_issues" SET "updated_at" = "updated_at"
      WHERE "id" = ${issue.id} AND "status" = 'draft'
      RETURNING "id"
    `);
    if (claimed.length === 0) throw magazineError("ISSUE_NOT_DRAFT");
    if (actor.via !== "auto") {
      // The claim locks the current draft; Payload reads its localized title
      // on that same transaction rather than using the caller's older copy.
      const current = await deps.payload.findByID({
        collection: "magazine-issues",
        id: issue.id,
        depth: 0,
        locale: routing.defaultLocale,
        req: tx.req,
      });
      await recordIssueHistory(tx, {
        ...historySnapshot(current),
        actorId: historyActorId(actor),
        detail: { event: "deleted" },
      });
    }
    await clearArticlePlacement(deps.payload, tx, issue.id);
    await deps.payload.delete({
      collection: "magazine-issues",
      id: issue.id,
      depth: 0,
      req: tx.req,
    });
  });
}
