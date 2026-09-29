import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { hasAccountNames } from "@/lib/person-name";
import type { db as Db } from "@/server/db";
import { user } from "@/server/db/schema";

/** The one reason `events.register` answers PRECONDITION_FAILED. */
export const NAME_REQUIRED = "NAME_REQUIRED";

/**
 * Make sure the member's account holds a first and last name before a
 * registration shares them with the event organizer (ADR-0038).
 *
 * Names given with the registration are saved to the account (the member
 * just confirmed them), so they are asked once, ever. Without them, the
 * account must already hold both, or the registration is refused with
 * PRECONDITION_FAILED / NAME_REQUIRED and the register button asks.
 *
 * Saved before the registration row is written: if registering then fails,
 * the member still typed their own name, and keeping it is harmless.
 */
export async function ensureAccountNames(
  db: typeof Db,
  userId: string,
  given: { firstName?: string; lastName?: string },
): Promise<void> {
  if (given.firstName && given.lastName) {
    await db
      .update(user)
      .set({ firstName: given.firstName, lastName: given.lastName })
      .where(eq(user.id, userId));
    return;
  }

  const [account] = await db
    .select({ firstName: user.firstName, lastName: user.lastName })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!account || !hasAccountNames(account)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: NAME_REQUIRED,
    });
  }
}
