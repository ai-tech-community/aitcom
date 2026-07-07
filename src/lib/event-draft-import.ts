import { z } from "zod";

import {
  EVENT_FOCUS_OPTIONS,
  EVENT_FORMAT_OPTIONS,
  EVENT_LEVEL_OPTIONS,
  EVENT_REVIEW_STATUS_OPTIONS,
  EVENT_TYPES,
} from "@/lib/event-metadata";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";

const optionalTrimmedString = z.string().trim().min(1).optional();

export const discoveredEventImportSchema = z.object({
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().max(5000).optional(),
  summary: z.string().trim().max(1000).optional(),
  type: z.enum(EVENT_TYPES).default("meetup"),
  date: z.string().trim().min(1),
  startTime: optionalTrimmedString,
  endTime: optionalTrimmedString,
  location: z.string().trim().min(1).max(255).default("TBD"),
  format: z.enum(EVENT_FORMAT_OPTIONS).optional(),
  region: optionalTrimmedString,
  country: optionalTrimmedString,
  city: optionalTrimmedString,
  focus: z.enum(EVENT_FOCUS_OPTIONS).optional(),
  level: z.enum(EVENT_LEVEL_OPTIONS).optional(),
  // Slugs — the stable public audience vocabulary (CONTEXT.md [[audience]]).
  // Passed through unresolved; whatever eventually writes this draft to
  // `events` (via event-upsert-data.ts's buildEventPayloadData /
  // resolveAudienceIds) is responsible for resolving slugs to `audiences`
  // relationship ids.
  audience: z.array(z.string()).max(8).optional(),
  sourceUrl: z.url().optional(),
  aitFitScore: z.number().min(1).max(10).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  curatedByAgent: z.boolean().optional().default(true),
  discoverySource: optionalTrimmedString,
  confidenceScore: z.number().min(0).max(1).optional(),
  lastVerifiedAt: z.string().datetime().optional(),
  reviewStatus: z
    .enum(EVENT_REVIEW_STATUS_OPTIONS)
    .optional()
    .default("discovered"),
  coverImageUrl: z.url().optional(),
  videoUrl: z.url().optional(),
});

export const discoveredEventBatchSchema = z.array(discoveredEventImportSchema);

export type DiscoveredEventImportInput = z.input<
  typeof discoveredEventImportSchema
>;
export type DiscoveredEventImport = z.infer<typeof discoveredEventImportSchema>;
export type EventDraftImportPayload = ReturnType<
  typeof buildEventDraftImportPayload
>;

function normalizeOptionalString(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function normalizeTags(tags?: string[]) {
  if (!tags?.length) return undefined;

  const deduped = Array.from(
    new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
  );

  return deduped.length > 0 ? deduped.map((tag) => ({ tag })) : undefined;
}

/**
 * Maps normalized scout output into a Payload-safe event draft create/update shape.
 * Media URLs stay in a sidecar block because Payload upload relationships require
 * a separate media ingestion step.
 */
export function buildEventDraftImportPayload(
  input: DiscoveredEventImportInput,
) {
  const event = discoveredEventImportSchema.parse(input);

  return {
    draftData: {
      title: event.title,
      description: plainTextToLexical(event.description ?? event.summary ?? ""),
      summary: normalizeOptionalString(event.summary),
      type: event.type,
      date: event.date,
      startTime: normalizeOptionalString(event.startTime),
      endTime: normalizeOptionalString(event.endTime),
      location: event.location,
      format: event.format,
      region: normalizeOptionalString(event.region),
      country: normalizeOptionalString(event.country),
      city: normalizeOptionalString(event.city),
      focus: event.focus,
      level: event.level,
      audience: event.audience?.length ? event.audience : undefined,
      sourceUrl: event.sourceUrl,
      aitFitScore: event.aitFitScore,
      tags: normalizeTags(event.tags),
      curatedByAgent: event.curatedByAgent ?? true,
      discoverySource: normalizeOptionalString(event.discoverySource),
      confidenceScore: event.confidenceScore,
      lastVerifiedAt: event.lastVerifiedAt,
      reviewStatus: event.reviewStatus ?? "discovered",
      videoUrl: event.videoUrl,
      status: "draft" as const,
    },
    media: {
      coverImageUrl: event.coverImageUrl,
      videoUrl: event.videoUrl,
    },
  };
}

export function buildEventDraftImportBatch(
  inputs: DiscoveredEventImportInput[],
) {
  return discoveredEventBatchSchema
    .parse(inputs)
    .map(buildEventDraftImportPayload);
}

export function parseDiscoveredEventBatch(input: unknown) {
  return discoveredEventBatchSchema.parse(input);
}
