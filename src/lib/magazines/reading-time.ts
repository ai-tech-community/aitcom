import { z } from "zod";

export const READING_REPORT_SECONDS = 15;
export const READING_IDLE_SECONDS = 60;
export const MAX_READING_SECONDS = 7200;
export const READING_TIME_PATH = "/api/magazine-reading-time";

export const readingTimeInput = z.object({
  sessionId: z.string().uuid(),
  issueId: z.number().int().positive(),
  articleId: z.number().int().positive().optional(),
  activeSeconds: z.number().int().min(0).max(MAX_READING_SECONDS),
});
export type ReadingTimeInput = z.infer<typeof readingTimeInput>;
