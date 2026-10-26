/**
 * Payload relationship values arrive as an id or, when populated, as
 * `{ id }`; numeric ids can come back as strings. One reader for every
 * magazine module.
 */

/** The numeric id of a relationship value, or null when it holds none. */
export function relationIdOrNull(value: unknown): number | null {
  const id =
    typeof value === "object" && value !== null
      ? (value as { id?: unknown }).id
      : value;
  const n = typeof id === "string" ? Number(id) : id;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** The numeric id of a required relationship; throws when it is missing. */
export function requireRelationId(value: unknown): number {
  const id = relationIdOrNull(value);
  if (id === null) throw new Error("A required relationship has no id");
  return id;
}
