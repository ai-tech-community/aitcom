import { eq } from "drizzle-orm";

import { magazineAutoDraftSettings } from "@/server/db/schema";

import type { Deps } from "../deps";

export async function autoPublishAllowed(
  db: Deps["db"],
  magazineId: number,
): Promise<boolean> {
  const settings = await db.query.magazineAutoDraftSettings.findFirst({
    where: eq(magazineAutoDraftSettings.magazineId, magazineId),
    columns: { whenReady: true },
  });
  return settings?.whenReady === "auto_publish";
}
