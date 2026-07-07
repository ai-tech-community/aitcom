import { z } from "zod";
import type { Payload } from "payload";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import { isValidTimeZone } from "@/lib/event-time";
import {
  EVENT_FOCUS_OPTIONS,
  EVENT_FORMAT_OPTIONS,
  EVENT_LEVEL_OPTIONS,
  EVENT_TYPES,
} from "@/lib/event-metadata";
import { resolveAudienceIds } from "./audience-resolve";

export const eventUpsertSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().max(5000).optional(),
  summary: z
    .string()
    .max(10000, "Summary is too long (max 10000 characters).")
    .optional(),
  type: z.enum(EVENT_TYPES),
  date: z.string(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format.")
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format.")
    .optional(),
  // IANA timezone the start/end times are expressed in. The form defaults it
  // from the organizer's browser; missing values fall back to the
  // collection-level default (Europe/Amsterdam).
  timezone: z
    .string()
    .max(64)
    .optional()
    .refine((value) => !value || isValidTimeZone(value), {
      message: "Invalid timezone — use an IANA name like Europe/Amsterdam.",
    }),
  location: z.string().min(1).max(255),
  format: z.enum(EVENT_FORMAT_OPTIONS).optional(),
  region: z.string().max(255).optional(),
  country: z.string().max(255).optional(),
  city: z.string().max(255).optional(),
  focus: z.enum(EVENT_FOCUS_OPTIONS).optional(),
  level: z.enum(EVENT_LEVEL_OPTIONS).optional(),
  // Slugs — the stable public audience vocabulary (CONTEXT.md [[audience]]);
  // resolved to `audiences` relationship ids server-side in
  // `buildEventPayloadData`. Max 8 per the tRPC API boundary convention.
  audience: z.array(z.string()).max(8).optional(),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  aitFitScore: z.number().min(1).max(10).optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  curatedByAgent: z.boolean().optional(),
  discoverySource: z.string().max(255).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  lastVerifiedAt: z.string().optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
  maxAttendees: z.number().min(1).optional(),
  // number = set/replace cover, null = clear it, undefined = leave unchanged
  coverImage: z.number().int().positive().nullable().optional(),
});

export function normalizeOptionalString(value?: string) {
  const trimmed = value?.trim();
  return trimmed ?? undefined;
}

export async function buildEventPayloadData(
  payload: Payload,
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
    timezone: normalizeOptionalString(input.timezone),
    location: input.location,
    format: input.format,
    region: normalizeOptionalString(input.region),
    country: normalizeOptionalString(input.country),
    city: normalizeOptionalString(input.city),
    focus: input.focus,
    level: input.level,
    audience: await resolveAudienceIds(payload, input.audience),
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
