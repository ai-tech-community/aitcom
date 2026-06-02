/**
 * Bootstrap a local development user.
 *
 * A fresh database has no users, but the root Hub (seed-ait-community.ts) needs
 * an owner and several content seeds need a user to attribute to. This creates
 * one verified email/password account via Better Auth (so the password is
 * hashed correctly) that you can sign in with locally.
 *
 * Idempotent: if the account already exists it is left untouched.
 *
 * Credentials (override via env):
 *   DEV_USER_EMAIL    (default dev@aitcommunity.local)
 *   DEV_USER_PASSWORD (default devpassword123)
 *   DEV_USER_NAME     (default Dev User)
 *
 * Run with:  tsx scripts/seed-dev-user.ts
 */
import { eq } from "drizzle-orm";

import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

const email = process.env.DEV_USER_EMAIL ?? "dev@aitcommunity.local";
const password = process.env.DEV_USER_PASSWORD ?? "devpassword123";
const name = process.env.DEV_USER_NAME ?? "Dev User";

async function main() {
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Dev user already exists (${email}). Skipping.`);
    return;
  }

  console.log(`Creating dev user ${email}...`);
  await auth.api.signUpEmail({ body: { email, password, name } });

  // requireEmailVerification is on, so mark the dev account verified to make it
  // loginable without a configured email provider.
  await db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.email, email));

  console.log("\nDev user ready. Sign in at /auth/signin with:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Dev user seed failed:", err);
    process.exit(1);
  });
