/**
 * Production currently 500s `/members` when `app.social_identity` has not
 * been migrated yet (Postgres `42P01`). Public leaderboard / profile reads
 * must fail open until that DDL exists.
 */
export function isMissingSocialIdentityRelation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);

    const code = "code" in current ? String(current.code) : "";
    const message =
      "message" in current && typeof current.message === "string"
        ? current.message
        : "";

    if (
      /social_identity/i.test(message) &&
      (code === "42P01" || /does not exist/i.test(message))
    ) {
      return true;
    }

    current = "cause" in current ? current.cause : undefined;
  }

  return false;
}

export async function ignoreMissingSocialIdentityTable<T>(
  run: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isMissingSocialIdentityRelation(error)) return fallback;
    throw error;
  }
}
