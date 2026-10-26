import { sql } from "@payloadcms/db-postgres";

import { routing } from "@/i18n/routing";
import type { ItemProblem } from "@/lib/magazines/item-views";
import type { IssueVisibility } from "@/lib/magazines/values";
import { slugify } from "@/lib/text-utils";
import type { Magazine, MagazineIssue } from "@/payload-types";

import {
  clearArticlePlacement,
  placedArticlesOf,
  syncArticlePlacement,
} from "./article-placement";
import { publishPlacedArticles } from "./article-publication";
import type { Deps, PayloadClient } from "./deps";
import { magazineError } from "./errors";
import {
  type IssueItemInput,
  type StoredBlock,
  toStoredItems,
  validateIssueItems,
} from "./items/registry";
import {
  inPayloadTransaction,
  type PayloadTransaction,
  uniqueViolationPath,
} from "./payload-writes";
import type { MagazineCommunity } from "./magazine-service";
import { planVisibilityChange } from "./visibility-change";

/** Who is writing, and the community the issue belongs to. */
export type IssueActor = { userId: string; community: MagazineCommunity };

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

/** Attempts at a new issue number when another editor takes it first. */
const CREATE_ATTEMPTS = 3;

/** A relationship value as stored (id) or populated (`{ id }`). */
function relationNumber(value: unknown): number {
  const id =
    typeof value === "object" && value !== null
      ? (value as { id?: unknown }).id
      : value;
  const n = Number(id);
  if (!Number.isFinite(n)) throw new Error("Missing relationship id");
  return n;
}

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

/** A unique-index violation from an issue write, as a magazine refusal. */
function mapIssueWriteError(error: unknown): unknown {
  const path = uniqueViolationPath(error);
  if (path !== null && /\bslug\b/.test(path)) {
    return magazineError("ISSUE_SLUG_TAKEN");
  }
  return error;
}

function isIssueNumberTaken(error: unknown): boolean {
  const path = uniqueViolationPath(error);
  return path !== null && /\bnumber\b/.test(path);
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

/**
 * An item problem as a refusal. `problem.code` passing as a
 * `MagazineErrorCode` is the compile-time check that every `ItemProblem`
 * code is a magazine refusal code the client can translate.
 */
function problemError(problem: ItemProblem) {
  return magazineError(problem.code, { itemIndex: problem.itemIndex });
}

async function assertItemsValid(
  payload: PayloadClient,
  issue: MagazineIssue,
  blocks: StoredBlock[],
): Promise<void> {
  const [problem] = await validateIssueItems(blocks, {
    payload,
    magazineId: relationNumber(issue.magazine),
    issueId: issue.id,
    // Validation reads review state and placement, not text.
    locale: routing.defaultLocale,
    editor: true,
  });
  if (problem) throw problemError(problem);
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

async function freeIssueSlug(
  payload: PayloadClient,
  magazineId: number,
  title: string,
  number: number,
): Promise<string> {
  const slug = issueSlugFor(title, number);
  const { totalDocs } = await payload.count({
    collection: "magazine-issues",
    where: {
      and: [{ magazine: { equals: magazineId } }, { slug: { equals: slug } }],
    },
  });
  if (totalDocs === 0) return slug;
  const base = slug.slice(0, ISSUE_SLUG_MAX - `-${number}`.length);
  return `${base.replace(/-+$/, "")}-${number}`;
}

/**
 * Creates the magazine's next issue as a draft: numbered after the highest
 * existing one, slugged from its title, with the magazine's default
 * visibility and its unlisted-public confirmation copied in.
 */
export async function createIssue(
  deps: Deps,
  magazine: Magazine,
  input: { title: string },
  // Part of every issue write's contract; creation copies the magazine's
  // already-confirmed default, so it needs no actor decision.
  _actor: IssueActor,
): Promise<MagazineIssue> {
  const visibility = magazine.defaultVisibility ?? "members";
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
          visibility,
          publicConfirmedBy:
            visibility === "public"
              ? (magazine.publicConfirmedBy ?? null)
              : null,
          publicConfirmedAt:
            visibility === "public"
              ? (magazine.publicConfirmedAt ?? null)
              : null,
          items: [],
        },
        depth: 0,
      });
    } catch (error) {
      // Another editor created an issue between our count and our insert.
      if (isIssueNumberTaken(error) && attempt < CREATE_ATTEMPTS) continue;
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
  if (patch.visibility !== undefined) {
    const plan = planVisibilityChange({
      next: patch.visibility,
      current: {
        visibility: issue.visibility,
        publicConfirmedBy: issue.publicConfirmedBy ?? null,
        publicConfirmedAt: issue.publicConfirmedAt ?? null,
      },
      community: actor.community,
      confirmUnlistedPublic: patch.confirmUnlistedPublic ?? false,
      actorId: actor.userId,
      now: new Date(),
    });
    if (!plan.ok) throw magazineError(plan.code);
    Object.assign(data, plan.record);
  }

  return writeIssue(deps, issue, expectedUpdatedAt, (tx) =>
    deps.payload.update({
      collection: "magazine-issues",
      id: issue.id,
      data,
      depth: 0,
      req: tx.req,
    }),
  );
}

/**
 * Saves an issue's item list and syncs article placement with it, in one
 * transaction. Every problem refuses the save with the problem's code and
 * item index. In an already published issue, newly added articles are
 * published (and credited) right after the save.
 */
export async function setIssueItems(
  deps: Deps,
  issue: MagazineIssue,
  items: IssueItemInput[],
  expectedUpdatedAt: string,
  _actor: IssueActor,
): Promise<MagazineIssue> {
  assertFresh(issue, expectedUpdatedAt);
  const blocks = toStoredItems(keepOwnBlockIds(items, storedBlocksOf(issue)));
  await assertItemsValid(deps.payload, issue, blocks);

  const saved = await writeIssue(deps, issue, expectedUpdatedAt, async (tx) => {
    await syncArticlePlacement(
      deps.payload,
      tx,
      issue.id,
      placedArticlesOf(blocks),
    );
    return deps.payload.update({
      collection: "magazine-issues",
      id: issue.id,
      data: { items: blocks as MagazineIssue["items"] },
      depth: 0,
      req: tx.req,
    });
  });

  if (saved.status === "published") {
    // Idempotent: only articles still in draft are published and credited,
    // so a save after a failed publish also completes it.
    await publishPlacedArticles(deps, articleIdsOf(blocks));
  }
  return saved;
}

/**
 * Publishes a draft issue. Refuses an empty issue and any item problem.
 * Inside the claimed transaction the articles are published first, then
 * the issue: if an article fails, the issue stays a draft at the same
 * `updatedAt`, and a retry publishes the rest (`publishPlacedArticles` is
 * idempotent). A concurrent second publish waits on the claim and gets
 * `ISSUE_CHANGED`.
 */
export async function publishIssue(
  deps: Deps,
  issue: MagazineIssue,
  expectedUpdatedAt: string,
  actor: IssueActor,
): Promise<MagazineIssue> {
  if (issue.status !== "draft") throw magazineError("ISSUE_NOT_DRAFT");
  assertFresh(issue, expectedUpdatedAt);
  const blocks = storedBlocksOf(issue);
  if (blocks.length === 0) throw magazineError("ISSUE_EMPTY");
  await assertItemsValid(deps.payload, issue, blocks);

  return writeIssue(deps, issue, expectedUpdatedAt, async (tx) => {
    await publishPlacedArticles(deps, articleIdsOf(blocks));
    return deps.payload.update({
      collection: "magazine-issues",
      id: issue.id,
      data: {
        status: "published",
        publishedAt: new Date().toISOString(),
        publishedBy: actor.userId,
      },
      depth: 0,
      req: tx.req,
    });
  });
}

/**
 * Deletes a draft issue and clears its articles' placement. A published
 * issue cannot be deleted (`ISSUE_NOT_DRAFT`); the check runs on the locked
 * row, so a publish that lands first wins.
 */
export async function deleteDraftIssue(
  deps: Deps,
  issue: MagazineIssue,
  _actor: IssueActor,
): Promise<void> {
  if (issue.status !== "draft") throw magazineError("ISSUE_NOT_DRAFT");
  await inPayloadTransaction(deps.payload, async (tx) => {
    const claimed = await tx.execute(sql`
      UPDATE "magazine_issues" SET "updated_at" = "updated_at"
      WHERE "id" = ${issue.id} AND "status" = 'draft'
      RETURNING "id"
    `);
    if (claimed.length === 0) throw magazineError("ISSUE_NOT_DRAFT");
    await clearArticlePlacement(deps.payload, tx, issue.id);
    await deps.payload.delete({
      collection: "magazine-issues",
      id: issue.id,
      depth: 0,
      req: tx.req,
    });
  });
}
