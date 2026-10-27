import { z } from "zod";

import type { ItemKindId } from "./item-views";
import {
  ISSUE_LAYOUTS,
  ISSUE_VISIBILITIES,
  type IssueLayout,
  type IssueVisibility,
} from "./values";

export const AUTO_DRAFT_CADENCES = [
  "monthly",
  "biweekly",
  "weekly",
  "after_event",
  "on_demand",
] as const;
export type AutoDraftCadence = (typeof AUTO_DRAFT_CADENCES)[number];
export const AUTO_DRAFT_LOOK_BACKS = [
  "since_last_issue",
  "days_30",
  "days_7",
] as const;
export type AutoDraftLookBack = (typeof AUTO_DRAFT_LOOK_BACKS)[number];
export const AUTO_DRAFT_WHEN_READY = ["notify", "auto_publish"] as const;
export type AutoDraftWhenReady = (typeof AUTO_DRAFT_WHEN_READY)[number];

/** Where suggestions come from (Decision 1); also the item order in a draft. */
export const AUTO_DRAFT_SOURCE_IDS = [
  "article",
  "storyline",
  "event",
  "forumThread",
  "launchpadProject",
  "newsItem",
  "welcome",
] as const;
export type AutoDraftSourceId = (typeof AUTO_DRAFT_SOURCE_IDS)[number];
export const AUTO_DRAFT_SOURCE_ORDER: readonly AutoDraftSourceId[] =
  AUTO_DRAFT_SOURCE_IDS;
export type AutoDraftSource = { enabled: boolean; max: number };
export const AUTO_DRAFT_SOURCE_MAX = 10;

/** The one record of per-source facts; defaults and limits below derive from it. */
export const AUTO_DRAFT_SOURCES = {
  article: {
    kind: "article",
    defaults: { enabled: true, max: 5 },
    maxLimit: AUTO_DRAFT_SOURCE_MAX,
    needsTopics: false,
    countsTowardMinimum: true,
  },
  storyline: {
    kind: "storyline",
    defaults: { enabled: true, max: 3 },
    maxLimit: AUTO_DRAFT_SOURCE_MAX,
    needsTopics: true,
    countsTowardMinimum: true,
  },
  event: {
    kind: "event",
    defaults: { enabled: true, max: 4 },
    maxLimit: AUTO_DRAFT_SOURCE_MAX,
    needsTopics: false,
    countsTowardMinimum: true,
  },
  forumThread: {
    kind: "forumThread",
    defaults: { enabled: true, max: 3 },
    maxLimit: AUTO_DRAFT_SOURCE_MAX,
    needsTopics: false,
    countsTowardMinimum: true,
  },
  launchpadProject: {
    kind: "launchpadProject",
    defaults: { enabled: true, max: 3 },
    maxLimit: AUTO_DRAFT_SOURCE_MAX,
    needsTopics: false,
    countsTowardMinimum: true,
  },
  newsItem: {
    kind: "newsItem",
    defaults: { enabled: true, max: 5 },
    maxLimit: AUTO_DRAFT_SOURCE_MAX,
    needsTopics: true,
    countsTowardMinimum: true,
  },
  welcome: {
    kind: "editorial",
    defaults: { enabled: true, max: 1 },
    maxLimit: 1,
    needsTopics: false,
    countsTowardMinimum: false,
  },
} as const satisfies Record<
  AutoDraftSourceId,
  {
    kind: ItemKindId;
    defaults: AutoDraftSource;
    maxLimit: number;
    needsTopics: boolean;
    countsTowardMinimum: boolean;
  }
>;

export type SourceKind<S extends AutoDraftSourceId> =
  (typeof AUTO_DRAFT_SOURCES)[S]["kind"];
/** Compile error when an item kind has no suggestion source. */
type AssertNever<T extends never> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Enforces source coverage at compile time.
type _EveryKindHasASource = AssertNever<
  Exclude<ItemKindId, SourceKind<AutoDraftSourceId>>
>;

export const AUTO_DRAFT_SOURCE_DEFAULTS: Record<
  AutoDraftSourceId,
  AutoDraftSource
> = Object.fromEntries(
  AUTO_DRAFT_SOURCE_IDS.map((source) => [
    source,
    { ...AUTO_DRAFT_SOURCES[source].defaults },
  ]),
) as Record<AutoDraftSourceId, AutoDraftSource>;

export function sourceMaxLimit(source: AutoDraftSourceId): number {
  return AUTO_DRAFT_SOURCES[source].maxLimit;
}

export const AUTO_DRAFT_MIN_ITEMS = 3;
export const AUTO_PUBLISH_DAYS_DEFAULT = 3;
export const AUTO_PUBLISH_DAYS_MAX = 14;
export const MONTH_DAY_MAX = 28;
export const LOOK_BACK_FALLBACK_DAYS = 30;
export const EVENT_COMING_UP_DAYS = 30;
export const AFTER_EVENT_LOOK_BACK_DAYS = 7;

export type AutoDraftSettings = {
  enabled: boolean;
  cadence: AutoDraftCadence;
  monthDay: number;
  weekday: number;
  lookBack: AutoDraftLookBack;
  layout: IssueLayout;
  visibility: IssueVisibility | null;
  publicConfirmedBy: string | null;
  publicConfirmedAt: string | null;
  sources: Record<AutoDraftSourceId, AutoDraftSource>;
  neverReuse: boolean;
  whenReady: AutoDraftWhenReady;
  autoPublishDays: number;
};

export const DEFAULT_AUTO_DRAFT_SETTINGS: AutoDraftSettings = {
  enabled: false,
  cadence: "monthly",
  monthDay: 1,
  weekday: 1,
  lookBack: "since_last_issue",
  layout: "cover-story",
  visibility: null,
  publicConfirmedBy: null,
  publicConfirmedAt: null,
  sources: AUTO_DRAFT_SOURCE_DEFAULTS,
  neverReuse: true,
  whenReady: "notify",
  autoPublishDays: AUTO_PUBLISH_DAYS_DEFAULT,
};

const storedSource = z.object({ enabled: z.boolean(), max: z.number().int() });
const sourceInputs = Object.fromEntries(
  AUTO_DRAFT_SOURCE_IDS.map((source) => [
    source,
    storedSource
      .extend({ max: z.number().int().min(1).max(sourceMaxLimit(source)) })
      .optional(),
  ]),
) as Record<AutoDraftSourceId, z.ZodOptional<typeof storedSource>>;

/** What the save form sends: settings without confirmations, plus the opt-in. */
export const autoDraftSettingsInput = z.object({
  enabled: z.boolean(),
  cadence: z.enum(AUTO_DRAFT_CADENCES),
  monthDay: z.number().int().min(1).max(MONTH_DAY_MAX),
  weekday: z.number().int().min(1).max(7),
  lookBack: z.enum(AUTO_DRAFT_LOOK_BACKS),
  layout: z.enum(ISSUE_LAYOUTS),
  visibility: z.enum(ISSUE_VISIBILITIES).nullable(),
  sources: z.object(sourceInputs),
  neverReuse: z.boolean(),
  whenReady: z.enum(AUTO_DRAFT_WHEN_READY),
  autoPublishDays: z.number().int().min(1).max(AUTO_PUBLISH_DAYS_MAX),
  confirmUnlistedPublic: z.boolean().default(false),
});
export type AutoDraftSettingsInput = z.infer<typeof autoDraftSettingsInput>;

/** Valid stored entries over the defaults; unknown ids dropped, counts clamped. */
export function resolveSources(
  stored: unknown,
): Record<AutoDraftSourceId, AutoDraftSource> {
  const entries = z.record(z.string(), z.unknown()).safeParse(stored);
  return Object.fromEntries(
    AUTO_DRAFT_SOURCE_IDS.map((source) => {
      const parsed = storedSource.safeParse(
        entries.success ? entries.data[source] : undefined,
      );
      const value = parsed.success
        ? {
            enabled: parsed.data.enabled,
            max: Math.max(1, Math.min(sourceMaxLimit(source), parsed.data.max)),
          }
        : { ...AUTO_DRAFT_SOURCE_DEFAULTS[source] };
      return [source, value];
    }),
  ) as Record<AutoDraftSourceId, AutoDraftSource>;
}
