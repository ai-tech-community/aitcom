/**
 * Thin auth-hook triggers for Hub enrolment. Extracted so the email+password
 * vs create-hook wiring is unit-testable without instantiating Better Auth.
 *
 * `user.create.after` runs for every signup, but Better Auth 1.3.10+ may
 * still be inside the user-create transaction. A second Neon connection
 * then cannot see the new `user` row, so the `community_membership` FK
 * insert fails. Email+password accounts are unverified at creation and
 * become committed before `afterEmailVerification` / first session —
 * those hooks retry enrolment. See ADR-0019.
 */
import { db } from "@/server/db";
import { enrollInHub } from "@/server/db/enroll-in-hub";

/** Fired from databaseHooks.user.create.after (every signup path). */
export async function enrollForCreatedUser(user: {
  id: string;
}): Promise<void> {
  await enrollInHub(db, user.id);
}

/** Fired from emailVerification.afterEmailVerification (email+password). */
export async function enrollAfterVerification(user: {
  id: string;
}): Promise<void> {
  await enrollInHub(db, user.id);
}

/** Fired from databaseHooks.session.create.after (first sign-in). */
export async function enrollOnSessionCreated(session: {
  userId: string;
}): Promise<void> {
  await enrollInHub(db, session.userId);
}
