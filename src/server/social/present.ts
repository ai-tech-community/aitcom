import { inArray } from "drizzle-orm";

import {
  presentPublicSocials,
  type PublicSocialPresentation,
  type VerifiedSocialIdentity,
} from "@/lib/social-identity";
import type { db } from "@/server/db";
import { account, socialIdentities } from "@/server/db/schema";

type Db = typeof db;

export type StoredSocialIdentity = {
  userId: string;
  provider: "github" | "linkedin";
  providerAccountId: string;
  handle: string | null;
  profileUrl: string | null;
};

export async function loadSocialIdentitiesForUsers(
  database: Db,
  userIds: string[],
): Promise<Map<string, StoredSocialIdentity[]>> {
  const map = new Map<string, StoredSocialIdentity[]>();
  if (userIds.length === 0) return map;

  const rows = await database
    .select({
      userId: socialIdentities.userId,
      provider: socialIdentities.provider,
      providerAccountId: socialIdentities.providerAccountId,
      handle: socialIdentities.handle,
      profileUrl: socialIdentities.profileUrl,
    })
    .from(socialIdentities)
    .where(inArray(socialIdentities.userId, userIds));

  for (const row of rows) {
    const list = map.get(row.userId) ?? [];
    list.push(row);
    map.set(row.userId, list);
  }
  return map;
}

export async function loadGithubAccountIds(
  database: Db,
  userIds: string[],
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (userIds.length === 0) return ids;

  const rows = await database
    .select({ userId: account.userId, providerId: account.providerId })
    .from(account)
    .where(inArray(account.userId, userIds));

  for (const row of rows) {
    if (row.providerId === "github") ids.add(row.userId);
  }
  return ids;
}

function withGithubAccountStub(
  identities: StoredSocialIdentity[],
  hasGithubAccount: boolean,
  userId: string,
): VerifiedSocialIdentity[] {
  const mapped: VerifiedSocialIdentity[] = identities.map((row) => ({
    provider: row.provider,
    providerAccountId: row.providerAccountId,
    handle: row.handle,
    profileUrl: row.profileUrl,
  }));

  if (hasGithubAccount && !mapped.some((i) => i.provider === "github")) {
    mapped.push({
      provider: "github",
      providerAccountId: userId,
      handle: null,
      profileUrl: null,
    });
  }
  return mapped;
}

export function presentMemberSocials(opts: {
  userId: string;
  identities: StoredSocialIdentity[];
  hasGithubAccount: boolean;
  pasted: {
    githubUrl?: string | null;
    linkedinUrl?: string | null;
    websiteUrl?: string | null;
  };
  subject: "member" | "agent";
}): PublicSocialPresentation {
  return presentPublicSocials({
    identities: withGithubAccountStub(
      opts.identities,
      opts.hasGithubAccount,
      opts.userId,
    ),
    pasted: opts.pasted,
    subject: opts.subject,
  });
}

export function toPublicSocialJson(social: PublicSocialPresentation) {
  return {
    github: social.github
      ? {
          handle: social.github.handle,
          url: social.github.url,
          verified: social.github.verified,
        }
      : null,
    linkedin: social.linkedin
      ? {
          handle: social.linkedin.handle,
          url: social.linkedin.url,
          verified: social.linkedin.verified,
        }
      : null,
    website: social.website
      ? { url: social.website.url, verified: false }
      : null,
  };
}
