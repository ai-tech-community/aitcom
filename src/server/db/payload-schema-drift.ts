/**
 * Tables whose columns must match what Payload builds from the config.
 *
 * `payload_locked_documents_rels` holds one `<collection>_id` column per
 * collection, and Payload's document-lock check reads all of them before
 * every update and delete by id. One missing column makes those writes fail
 * in every collection (20260608d, 20260927a). A collection's own migration
 * creates its table but easily forgets this column, so check it on deploy.
 *
 * Not every Payload table: some collections' tables are not in `public` or
 * not created yet, and checking them would fail every deploy. Add a table
 * here once it matches.
 */
export const GUARDED_PAYLOAD_TABLES = [
  "payload_locked_documents_rels",
  "hosted_materials",
];

/** "table.column" for each expected column the database does not have. */
export function findMissingColumns(
  expected: Record<string, string[]>,
  actual: { table: string; column: string }[],
): string[] {
  const have = new Set(actual.map((c) => `${c.table}.${c.column}`));
  return Object.entries(expected).flatMap(([table, columns]) =>
    columns
      .map((column) => `${table}.${column}`)
      .filter((key) => !have.has(key)),
  );
}
