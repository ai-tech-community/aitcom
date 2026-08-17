import { and, eq } from "drizzle-orm";

import { fetchGithubProfile } from "@/lib/github-profile";
import {
  linkedinIdentityFromIdToken,
  type SocialProvider,
} from "@/lib/social-identity";
import { db } from "@/server/db";
import { account, socialIdentities } from "@/server/db/schema";
import { ignoreMissingSocialIdentityTable } from "@/server/social/errors";

type Db = typeof db;

export async function upsertVerifiedIdentity(
  database: Db,
  input: {
    userId: string;
    provider: SocialProvider;
    providerAccountId: string;
    handle?: string | null;
    profileUrl?: string | null;
  },
): Promise<void> {
  const now = new Date();
  const [existing] = await database
    .select()
    .from(socialIdentities)
    .where(
      and(
        eq(socialIdentities.userId, input.userId),
        eq(socialIdentities.provider, input.provider),
      ),
    )
    .limit(1);

  if (existing) {
    await database
      .update(socialIdentities)
      .set({
        providerAccountId: input.providerAccountId,
        handle: input.handle ?? existing.handle,
        profileUrl: input.profileUrl ?? existing.profileUrl,
        verifiedAt: now,
      })
      .where(eq(socialIdentities.id, existing.id));
    return;
  }

  await database.insert(socialIdentities).values({
    userId: input.userId,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    handle: input.handle ?? null,
    profileUrl: input.profileUrl ?? null,
    verifiedAt: now,
  });
}

export async function clearVerifiedIdentity(
  database: Db,
  userId: string,
  provider: SocialProvider,
): Promise<void> {
  await database
    .delete(socialIdentities)
    .where(
      and(
        eq(socialIdentities.userId, userId),
        eq(socialIdentities.provider, provider),
      ),
    );
}

export async function listVerifiedIdentities(database: Db, userId: string) {
  return database
    .select()
    .from(socialIdentities)
    .where(eq(socialIdentities.userId, userId));
}

export async function syncGithubIdentityFromAccount(
  database: Db,
  githubAccount: {
    userId: string;
    accountId: string;
    accessToken?: string | null;
  },
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const profile = await fetchGithubProfile(
    {
      accessToken: githubAccount.accessToken,
      accountId: githubAccount.accountId,
    },
    fetchFn,
  );

  await upsertVerifiedIdentity(database, {
    userId: githubAccount.userId,
    provider: "github",
    providerAccountId: githubAccount.accountId,
    handle: profile?.login ?? null,
    profileUrl: profile?.htmlUrl ?? null,
  });
}

export async function ensureGithubIdentityForUser(
  database: Db,
  userId: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const [githubAccount] = await database
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "github")))
    .limit(1);

  if (!githubAccount) return;

  const [existing] = await ignoreMissingSocialIdentityTable(
    () =>
      database
        .select()
        .from(socialIdentities)
        .where(
          and(
            eq(socialIdentities.userId, userId),
            eq(socialIdentities.provider, "github"),
          ),
        )
        .limit(1),
    [],
  );

  if (existing?.handle) return;

  await ignoreMissingSocialIdentityTable(
    () => syncGithubIdentityFromAccount(database, githubAccount, fetchFn),
    undefined,
  );
}

export async function syncLinkedinIdentityFromAccount(
  database: Db,
  linkedinAccount: {
    userId: string;
    accountId: string;
    idToken?: string | null;
  },
): Promise<void> {
  const fromToken = linkedinIdentityFromIdToken(linkedinAccount.idToken);
  await upsertVerifiedIdentity(database, {
    userId: linkedinAccount.userId,
    provider: "linkedin",
    providerAccountId: fromToken?.sub ?? linkedinAccount.accountId,
    handle: fromToken?.name ?? null,
    profileUrl: null,
  });
}

export async function onAuthAccountCreated(created: {
  userId: string;
  providerId: string;
  accountId: string;
  accessToken?: string | null;
  idToken?: string | null;
}): Promise<void> {
  try {
    if (created.providerId === "github") {
      await syncGithubIdentityFromAccount(db, created);
    }
    if (created.providerId === "linkedin") {
      await syncLinkedinIdentityFromAccount(db, created);
    }
  } catch {
    // Identity sync must never fail signup / account linking.
  }
}

export async function onAuthAccountDeleted(deleted: {
  userId: string;
  providerId: string;
}): Promise<void> {
  if (deleted.providerId !== "github" && deleted.providerId !== "linkedin") {
    return;
  }
  try {
    await clearVerifiedIdentity(db, deleted.userId, deleted.providerId);
  } catch {
    // non-blocking
  }
}
