import type { PostgresAdapter } from "@payloadcms/db-postgres";

import type { PayloadClient } from "./deps";

/**
 * Queue two real service transactions behind an independent row lock. Observe
 * each lockArticle SELECT waiting before starting/releasing the next writer;
 * a later Payload hook's lock must not make a missing service lock pass.
 */
export async function interleaveArticleWrites<A, B>(
  payload: PayloadClient,
  articleId: number,
  first: () => Promise<A>,
  second: () => Promise<B>,
): Promise<[PromiseSettledResult<A>, PromiseSettledResult<B>]> {
  const adapter = payload.db as unknown as PostgresAdapter;
  const holder = new adapter.pg.Client({
    connectionString: process.env.DATABASE_URL,
  });
  const pending: Promise<unknown>[] = [];
  await holder.connect();
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT 1 FROM articles WHERE id=$1 FOR UPDATE", [
      articleId,
    ]);
    const { rows: holders } = await holder.query<{ pid: number }>(
      "SELECT pg_backend_pid() AS pid",
    );
    const holderPid = holders[0]!.pid;

    async function waitForWriters(count: number): Promise<void> {
      const deadline = Date.now() + 5_000;
      do {
        // The holder stays in one transaction, so refresh Postgres' cached
        // activity snapshot before observing writers that started later.
        await holder.query("SELECT pg_stat_clear_snapshot()");
        const { rows } = await holder.query<{ count: number }>(
          `WITH RECURSIVE blocked AS (
             SELECT pid FROM pg_stat_activity
             WHERE $1 = ANY(pg_blocking_pids(pid))
             UNION
             SELECT activity.pid FROM pg_stat_activity AS activity
             JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(activity.pid))
           )
           SELECT count(*)::int AS count FROM pg_stat_activity AS activity
           JOIN blocked USING (pid)
           WHERE activity.datname = current_database()
             AND activity.wait_event_type = 'Lock'
             AND activity.query LIKE '%SELECT 1 FROM "articles" WHERE "id" = % FOR UPDATE%'`,
          [holderPid],
        );
        if (rows[0]!.count === count) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      } while (Date.now() < deadline);
      throw new Error(
        `Expected ${count} lockArticle SELECT(s) blocked on article ${articleId}`,
      );
    }

    // Attach rejection handlers immediately, including while a lock observation
    // fails, so finally can release the holder and drain every started call.
    const a = Promise.allSettled([first()]);
    pending.push(a);
    await waitForWriters(1);
    const b = Promise.allSettled([second()]);
    pending.push(b);
    await waitForWriters(2);
    await holder.query("COMMIT");
    return [(await a)[0], (await b)[0]];
  } finally {
    try {
      await holder.query("ROLLBACK");
    } finally {
      await holder.end();
      await Promise.allSettled(pending);
    }
  }
}
