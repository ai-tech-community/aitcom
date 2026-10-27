import { type PostgresAdapter, sql } from "@payloadcms/db-postgres";
import { type PayloadRequest, ValidationError } from "payload";

import type { Article } from "@/payload-types";

import type { PayloadClient } from "./deps";

type SQL = ReturnType<typeof sql>;

/**
 * One Payload transaction. Pass `req` to every Payload call that belongs to
 * it; `execute` runs SQL on the same connection, for the row-level
 * compare-and-set checks Payload's API cannot express.
 */
export type PayloadTransaction = {
  req: Partial<PayloadRequest> | undefined;
  execute(query: SQL): Promise<Record<string, unknown>[]>;
};

/**
 * Decision 12: lock the article row before reading its latest draft through
 * Payload on the same transaction. Null when the article is gone.
 */
export async function lockArticle(
  tx: PayloadTransaction,
  payload: PayloadClient,
  articleId: number,
): Promise<Article | null> {
  await tx.execute(sql`
    SELECT 1 FROM "articles" WHERE "id" = ${articleId} FOR UPDATE
  `);
  return payload.findByID({
    collection: "articles",
    id: articleId,
    draft: true,
    req: tx.req,
    disableErrors: true,
    depth: 0,
  });
}

/**
 * Runs `work` in one Payload transaction: committed when it returns, rolled
 * back when it throws. The same shape as the classroom routers' writes; SQL
 * goes to the transaction's own session, as in `post-announcements.ts`.
 */
export async function inPayloadTransaction<T>(
  payload: PayloadClient,
  work: (tx: PayloadTransaction) => Promise<T>,
): Promise<T> {
  const adapter = payload.db as unknown as PostgresAdapter;
  const transactionID = await payload.db.beginTransaction();
  const req = transactionID ? { transactionID } : undefined;
  const tx: PayloadTransaction = {
    req,
    async execute(query) {
      const session = transactionID
        ? adapter.sessions[transactionID]?.db
        : undefined;
      const { rows } = await (session ?? adapter.drizzle).execute(query);
      return rows;
    },
  };
  try {
    const result = await work(tx);
    if (transactionID) await payload.db.commitTransaction(transactionID);
    return result;
  } catch (error) {
    if (transactionID) await payload.db.rollbackTransaction(transactionID);
    throw error;
  }
}

/**
 * The field path of a unique-index violation from a Payload write, or null
 * for any other error. Payload turns Postgres 23505 into a ValidationError
 * whose path is the field (`"slug"`, `"communityId"`) or, for a compound
 * index, the key columns from the error detail (`"magazine_id, slug"`).
 */
export function uniqueViolationPath(error: unknown): string | null {
  if (!(error instanceof ValidationError)) return null;
  const path = error.data.errors[0]?.path;
  return typeof path === "string" && path.length > 0 ? path : null;
}

/** Postgres SQLSTATEs for a transaction aborted by a concurrent one. */
const CONCURRENCY_ABORTS = new Set(["40P01", "40001"]);

/**
 * Whether an error is Postgres aborting the transaction because of a
 * concurrent one (deadlock or serialization failure), however deeply the
 * driver or Payload wrapped it.
 */
export function isConcurrencyAbort(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && CONCURRENCY_ABORTS.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
