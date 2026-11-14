/**
 * Test support: just enough of Payload's query language to run the
 * gallery's queries in memory, so unit tests check which rows a viewer's
 * query really matches rather than the query's shape.
 */

type Doc = Record<string, unknown>;
type Where = Record<string, unknown>;

/** Whether `doc` is a row that Payload's `where` matches. */
export function matchesWhere(doc: Doc, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "and") {
      return (condition as Where[]).every((w) => matchesWhere(doc, w));
    }
    if (key === "or") {
      return (condition as Where[]).some((w) => matchesWhere(doc, w));
    }
    const value = doc[key];
    return Object.entries(condition as Record<string, unknown>).every(
      ([op, operand]) => {
        switch (op) {
          case "equals":
            return value === operand;
          case "not_equals":
            return value !== operand;
          case "in":
            return (operand as unknown[]).includes(value);
          case "not_in":
            return !(operand as unknown[]).includes(value);
          case "like":
            return likeMatches(value, operand as string);
          case "exists":
            return (value !== null && value !== undefined) === operand;
          case "less_than":
            return (value as number | string) < (operand as number | string);
          case "less_than_equal":
            return (value as number | string) <= (operand as number | string);
          default:
            throw new Error(`fake payload: unsupported operator ${op}`);
        }
      },
    );
  });
}

/**
 * Payload's `like`: every word of the operand appears in the value, case
 * ignored. An empty value never matches.
 */
function likeMatches(value: unknown, operand: string): boolean {
  if (typeof value !== "string") return false;
  const text = value.toLowerCase();
  return operand
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

/** Rows in the order of a single-field Payload `sort` (`-` for descending). */
export function sortDocs(docs: Doc[], sort: string | undefined): Doc[] {
  if (!sort) return docs;
  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;
  return [...docs].sort((a, b) => {
    const x = a[field] as number | string;
    const y = b[field] as number | string;
    const order = x < y ? -1 : x > y ? 1 : 0;
    return desc ? -order : order;
  });
}

/** A row cut to a Payload `select`: the id plus the selected fields. */
export function selectFields(doc: Doc, select: Doc | undefined): Doc {
  if (!select) return doc;
  const picked: Doc = { id: doc.id };
  for (const [field, wanted] of Object.entries(select)) {
    if (wanted === true) picked[field] = doc[field];
  }
  return picked;
}
