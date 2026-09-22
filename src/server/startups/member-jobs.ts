import { and, eq } from "drizzle-orm";

import type { StartupJobsFollow } from "@/lib/investigations/startup-roles";
import { db } from "@/server/db";
import {
  startupJobsFollows,
  startupRoleApplications,
  startupRoles,
} from "@/server/db/schema";

function followWhere(userId: string, follow: StartupJobsFollow) {
  return and(
    eq(startupJobsFollows.userId, userId),
    eq(startupJobsFollows.company, follow.company),
    eq(startupJobsFollows.q, follow.q),
    eq(startupJobsFollows.location, follow.location),
    eq(startupJobsFollows.workType, follow.workType),
  );
}

export async function findStartupJobsFollow(
  userId: string,
  follow: StartupJobsFollow,
): Promise<{ lastSeenAt: Date } | null> {
  try {
    const [row] = await db
      .select({ lastSeenAt: startupJobsFollows.lastSeenAt })
      .from(startupJobsFollows)
      .where(followWhere(userId, follow))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

export async function setStartupJobsFollow(input: {
  userId: string;
  follow: StartupJobsFollow;
  following: boolean;
}): Promise<{ following: boolean }> {
  if (!input.following) {
    await db
      .delete(startupJobsFollows)
      .where(followWhere(input.userId, input.follow));
    return { following: false };
  }
  const existing = await findStartupJobsFollow(input.userId, input.follow);
  if (existing) return { following: true };
  const now = new Date();
  try {
    await db.insert(startupJobsFollows).values({
      userId: input.userId,
      company: input.follow.company,
      q: input.follow.q,
      location: input.follow.location,
      workType: input.follow.workType,
      lastSeenAt: now,
      createdAt: now,
    });
  } catch {
    const again = await findStartupJobsFollow(input.userId, input.follow);
    if (!again) throw new Error("Could not save this search.");
  }
  return { following: true };
}

/** Move the "since last visit" window to now. Does nothing when the row is gone. */
export async function markStartupJobsFollowSeen(
  userId: string,
  follow: StartupJobsFollow,
): Promise<void> {
  try {
    await db
      .update(startupJobsFollows)
      .set({ lastSeenAt: new Date() })
      .where(followWhere(userId, follow));
  } catch {
    // Missing table must not take down the public jobs page.
  }
}

export async function findStartupRoleApplication(
  userId: string,
  roleId: string,
): Promise<boolean> {
  try {
    const [row] = await db
      .select({ roleId: startupRoleApplications.roleId })
      .from(startupRoleApplications)
      .where(
        and(
          eq(startupRoleApplications.userId, userId),
          eq(startupRoleApplications.roleId, roleId),
        ),
      )
      .limit(1);
    return Boolean(row);
  } catch {
    return false;
  }
}

export async function setStartupRoleApplication(input: {
  userId: string;
  roleId: string;
  applying: boolean;
}): Promise<{ applying: boolean }> {
  const [role] = await db
    .select({ id: startupRoles.id })
    .from(startupRoles)
    .where(eq(startupRoles.id, input.roleId))
    .limit(1);
  if (!role) {
    throw new Error("Role not found");
  }
  if (!input.applying) {
    await db
      .delete(startupRoleApplications)
      .where(
        and(
          eq(startupRoleApplications.userId, input.userId),
          eq(startupRoleApplications.roleId, input.roleId),
        ),
      );
    return { applying: false };
  }
  const existing = await findStartupRoleApplication(input.userId, input.roleId);
  if (existing) return { applying: true };
  await db.insert(startupRoleApplications).values({
    userId: input.userId,
    roleId: input.roleId,
    createdAt: new Date(),
  });
  return { applying: true };
}
