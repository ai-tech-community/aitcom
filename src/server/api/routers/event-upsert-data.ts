import { z } from "zod";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import {
  EVENT_AUDIENCE_OPTIONS,
  EVENT_FOCUS_OPTIONS,
  EVENT_FORMAT_OPTIONS,
  EVENT_LEVEL_OPTIONS,
  EVENT_TYPES,
} from "@/lib/event-metadata";

export const eventUpsertSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().max(5000).optional(),
  summary: z
    .string()
    .max(10000, "Summary is too long (max 10000 characters).")
    .optional(),
  type: z.enum(EVENT_TYPES),
  date: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  location: z.string().min(1).max(255),
  format: z.enum(EVENT_FORMAT_OPTIONS).optional(),
  region: z.string().max(255).optional(),
  country: z.string().max(255).optional(),
  city: z.string().max(255).optional(),
  focus: z.enum(EVENT_FOCUS_OPTIONS).optional(),
  level: z.enum(EVENT_LEVEL_OPTIONS).optional(),
  audience: z.array(z.enum(EVENT_AUDIENCE_OPTIONS)).max(6).optional(),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  aitFitScore: z.number().min(1).max(10).optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  curatedByAgent: z.boolean().optional(),
  discoverySource: z.string().max(255).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  lastVerifiedAt: z.string().optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
  maxAttendees: z.number().min(1).optional(),
  coverImage: z.number().int().positive().optional(),
});

export function normalizeOptionalString(value?: string) {
  const trimmed = value?.trim();
  return trimmed ?? undefined;
}

export function buildEventPayloadData(
  input: z.infer<typeof eventUpsertSchema>,
) {
  return {
    title: input.title,
    description: plainTextToLexical(input.description ?? ""),
    summary: normalizeOptionalString(input.summary),
    type: input.type,
    date: input.date,
    startTime: normalizeOptionalString(input.startTime),
    endTime: normalizeOptionalString(input.endTime),
    location: input.location,
    format: input.format,
    region: normalizeOptionalString(input.region),
    country: normalizeOptionalString(input.country),
    city: normalizeOptionalString(input.city),
    focus: input.focus,
    level: input.level,
    audience: input.audience?.length ? input.audience : undefined,
    sourceUrl: normalizeOptionalString(input.sourceUrl),
    aitFitScore: input.aitFitScore,
    tags: input.tags?.length
      ? input.tags
          .map((tag) => ({ tag: tag.trim() }))
          .filter((entry) => entry.tag.length > 0)
      : undefined,
    curatedByAgent: input.curatedByAgent ?? false,
    discoverySource: normalizeOptionalString(input.discoverySource),
    confidenceScore: input.confidenceScore,
    lastVerifiedAt: input.lastVerifiedAt
      ? new Date(input.lastVerifiedAt).toISOString()
      : undefined,
    videoUrl: normalizeOptionalString(input.videoUrl),
    maxAttendees: input.maxAttendees,
    coverImage: input.coverImage,
  };
}
