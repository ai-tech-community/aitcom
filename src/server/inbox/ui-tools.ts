import { z } from "zod";

import type { db as Db } from "@/server/db";

type DB = typeof Db;

/** Tools an embedded UI may invoke, each executed AS the acting human under
 *  their own permissions. Starts empty; add per concrete need, always calling
 *  the SAME service the normal router uses so existing checks run. */
export const UI_TOOLS: Record<
  string,
  { input: z.ZodTypeAny; run: (db: DB, userId: string, args: unknown) => Promise<unknown> }
> = {};

export async function runUiTool(db: DB, userId: string, name: string, rawArgs: unknown) {
  const tool = UI_TOOLS[name];
  if (!tool) throw new Error(`tool not allowed: ${name}`);
  const args = tool.input.parse(rawArgs);
  return tool.run(db, userId, args);
}
