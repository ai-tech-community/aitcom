import { TRPCError } from "@trpc/server";

/**
 * Public tRPC error detail at `data.communityCreateConflictField`.
 * `name` means an exact duplicate name. `slug` means a taken or reserved address.
 */
export type CommunityCreateConflictField = "name" | "slug";

export class CommunityCreateConflict extends Error {
  constructor(readonly field: CommunityCreateConflictField) {
    super(`Community create conflict on ${field}`);
    this.name = "CommunityCreateConflict";
  }
}

export function communityCreateConflict(field: CommunityCreateConflictField) {
  return new TRPCError({
    code: "CONFLICT",
    message:
      field === "name"
        ? "A community with this name already exists"
        : "A community with a similar name already exists",
    cause: new CommunityCreateConflict(field),
  });
}

/** Neon exposes SQLSTATE and the constraint name. Drizzle may wrap the error. */
export function communityInsertConflictField(
  error: unknown,
): CommunityCreateConflictField | null {
  const seen = new Set<object>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (
      "code" in current &&
      current.code === "23505" &&
      "constraint" in current
    ) {
      if (
        current.constraint === "community_name_unique" ||
        current.constraint === "community_name_key"
      )
        return "name";
      if (
        current.constraint === "community_slug_unique" ||
        current.constraint === "community_slug_key"
      )
        return "slug";
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return null;
}
