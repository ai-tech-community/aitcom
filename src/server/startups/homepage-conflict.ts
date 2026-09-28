const HOMEPAGE_UNIQUE_INDEX = "startup_homepage_idx";

/**
 * True when Postgres rejected an insert because `startup_homepage_idx`
 * already holds this homepage. Walks Drizzle's `cause` chain. Slug conflicts
 * (`startup_slug_idx`) stay false so they are not reported as homepage skips.
 */
export function isStartupHomepageUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (errorRecordMatchesHomepageUnique(current)) return true;
    current = "cause" in current ? current.cause : undefined;
  }

  return false;
}

function errorRecordMatchesHomepageUnique(error: object): boolean {
  const record = error as {
    code?: unknown;
    constraint?: unknown;
    constraint_name?: unknown;
    message?: unknown;
    detail?: unknown;
  };
  const code = typeof record.code === "string" ? record.code : "";
  const constraint =
    typeof record.constraint === "string"
      ? record.constraint
      : typeof record.constraint_name === "string"
        ? record.constraint_name
        : "";
  const message = typeof record.message === "string" ? record.message : "";
  const detail = typeof record.detail === "string" ? record.detail : "";
  const mentionsIndex =
    constraint === HOMEPAGE_UNIQUE_INDEX ||
    message.includes(HOMEPAGE_UNIQUE_INDEX) ||
    detail.includes(HOMEPAGE_UNIQUE_INDEX);
  if (!mentionsIndex) return false;
  if (constraint === HOMEPAGE_UNIQUE_INDEX) return true;
  return (
    code === "23505" ||
    /duplicate key value violates unique constraint/i.test(message)
  );
}
