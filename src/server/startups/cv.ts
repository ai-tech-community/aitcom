import { eq } from "drizzle-orm";

import {
  parseStartupCvFileName,
  STARTUP_CV_PURPOSE,
  type StartupCvPublic,
  type StartupCvRecord,
} from "@/lib/investigations/startup-cv";
import { db } from "@/server/db";
import { startupMemberCvs } from "@/server/db/schema";

function toPublic(row: typeof startupMemberCvs.$inferSelect): StartupCvPublic {
  return {
    fileName: row.fileName,
    uploadedAt: (row.updatedAt ?? row.createdAt).toISOString(),
    textLength: row.textContent.length,
  };
}

export async function findStartupCvForUser(
  userId: string,
): Promise<StartupCvRecord | null> {
  const [row] = await db
    .select()
    .from(startupMemberCvs)
    .where(eq(startupMemberCvs.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    ...toPublic(row),
    textContent: row.textContent,
  };
}

export async function upsertStartupCvForUser(input: {
  userId: string;
  fileName: string;
  mimeType: string;
  textContent: string;
}): Promise<StartupCvPublic> {
  const fileName = parseStartupCvFileName(input.fileName);
  if (!fileName) {
    throw new Error("Use a short file name.");
  }
  const now = new Date();
  const existing = await findStartupCvForUser(input.userId);
  if (existing) {
    const [row] = await db
      .update(startupMemberCvs)
      .set({
        fileName,
        mimeType: input.mimeType.slice(0, 128),
        textContent: input.textContent,
        purpose: STARTUP_CV_PURPOSE,
        updatedAt: now,
      })
      .where(eq(startupMemberCvs.userId, input.userId))
      .returning();
    if (!row) throw new Error("Could not store CV.");
    return toPublic(row);
  }
  const [row] = await db
    .insert(startupMemberCvs)
    .values({
      userId: input.userId,
      fileName,
      mimeType: input.mimeType.slice(0, 128),
      textContent: input.textContent,
      purpose: STARTUP_CV_PURPOSE,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new Error("Could not store CV.");
  return toPublic(row);
}

export async function deleteStartupCvForUser(userId: string): Promise<void> {
  await db.delete(startupMemberCvs).where(eq(startupMemberCvs.userId, userId));
}
