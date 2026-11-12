import { getTableName, type Table } from "drizzle-orm";

/** In-memory query responses only. Never creates a database client. */
export function fakePaymentDatabase(
  rows: unknown[][],
  updateRows: unknown[][] = [],
) {
  const updates: { table: string; values: Record<string, unknown> }[] = [];
  const inserts: { table: string; values: unknown }[] = [];
  const chain = (result: unknown[]) => {
    const query = {
      from: () => query,
      where: () => query,
      limit: () => query,
      orderBy: () => query,
      for: () => query,
      innerJoin: () => query,
      returning: () => query,
      onConflictDoNothing: () => query,
      onConflictDoUpdate: () => query,
      then: (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return query;
  };
  const db = {
    select: () => chain(rows.shift() ?? []),
    execute: async () => undefined,
    insert: (table: Table) => ({
      values: (values: unknown) => {
        inserts.push({ table: getTableName(table), values });
        return chain([]);
      },
    }),
    update: (table: Table) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table: getTableName(table), values });
        return chain(updateRows.shift() ?? []);
      },
    }),
    transaction: async (
      callback: (tx: unknown) => Promise<unknown>,
    ): Promise<unknown> => callback(db),
  };
  return { db: db as never, updates, inserts, remaining: rows };
}
