import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { parseAddress } from "@/lib/collectors/address";
import type { PresetGroup } from "@/lib/collectors/presets";
import {
  type InputProblems,
  inputProblemsOf,
} from "@/lib/collectors/input-problems";

import type { db as appDb } from "@/server/db";
import { collectorItems, collectorRuns } from "@/server/db/schema";

import { columnsOf } from "./catalog";
import type { AnyCollector, FieldHint } from "./collector";
import { EXPORT_FORMATS, type ExportFormatId } from "./export/formats";
import {
  DEFAULT_QUOTA,
  type QuotaLimits,
  canStartRun,
  countRunsInWindow,
} from "./quota";
import type { FailureDetail } from "./errors";
import type { AnyPreset } from "./presets/preset";
import { recognizePreset } from "./presets/recognize";
import type { RunStatus, StopReason } from "./run-status";

const RETENTION_MS = 30 * 86_400_000;
const EXPORT_PAGE = 500;

export interface CollectorCatalogPort {
  /** The collectors members may start now (switched-off ones left out). */
  all(): readonly AnyCollector[];
  /** One collector members may start now, or undefined. */
  get(id: string): AnyCollector | undefined;
  /**
   * The full catalog, switched-off collectors included: for what an existing
   * run needs after its collector was switched off (its name, its columns).
   */
  everything(): readonly AnyCollector[];
}

export interface PresetCatalogPort {
  all(): readonly AnyPreset[];
  get(id: string): AnyPreset | undefined;
}

export interface CollectorRunsDeps {
  db: typeof appDb;
  enabled(): boolean;
  catalog: CollectorCatalogPort;
  /** Presets; a preset whose collector the catalog hides is hidden too. */
  presets: PresetCatalogPort;
  /** Best-effort wake of the worker; the per-minute cron is the guarantee. */
  kick(): void;
  now(): Date;
  quota?: QuotaLimits;
}

/**
 * A start names a preset (the web: every start goes through one) or a
 * collector (the agent, ADR-0040; no preset is recorded).
 */
export type StartRunArgs = {
  userId: string;
  agentId?: string | null;
  origin: "web" | "mcp";
  input: unknown;
} & (
  | { presetId: string; collectorId?: never }
  | { collectorId: string; presetId?: never }
);

export type StartRunResult =
  | { ok: true; runId: string }
  | {
      ok: false;
      reason: "disabled" | "unknown_collector" | "invalid_input" | "quota";
      message: string;
      /**
       * invalid_input only: why each input was refused, as codes by full
       * path ("fields.2.selector" → ["selector_not_allowed/not_allowed"]).
       */
      fieldErrors?: InputProblems;
      /** Quota only: which limit refused the start. */
      quotaReason?: "daily_limit" | "active_limit" | "platform_busy";
      /** Quota only: when a new start will be allowed (ISO 8601), if known. */
      retryAt?: string;
    };

export type RunView = {
  id: string;
  collectorId: string;
  collectorVersion: number;
  /** The preset the run was started from; null before presets and for agent starts. */
  presetId: string | null;
  origin: "web" | "mcp";
  agentId: string | null;
  status: RunStatus;
  stopReason: StopReason | null;
  input: unknown;
  pagesFetched: number;
  bytesFetched: number;
  itemCount: number;
  invalidItemCount: number;
  durationMs: number | null;
  /** English, for MCP and logs; screens show `errorDetail` instead. */
  error: string | null;
  errorDetail: FailureDetail | null;
  log: string[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string;
};

/** A field (or column) hint in the member's language. */
export type FieldHintSummary = {
  name: string;
  label: string;
  help: string | null;
  placeholder: string | null;
};

function localiseHint(
  name: string,
  hint: FieldHint,
  locale: "en" | "nl",
): FieldHintSummary {
  return {
    name,
    label: hint.label[locale],
    help: hint.help?.[locale] ?? null,
    placeholder: hint.placeholder ?? null,
  };
}

export type CollectorSummary = {
  id: string;
  kind: AnyCollector["kind"];
  title: string;
  description: string;
  fields: (FieldHintSummary & {
    /** For a list-of-rows field, its columns; null for any other field. */
    columns: FieldHintSummary[] | null;
  })[];
  inputJsonSchema: unknown;
  sampleItem: Record<string, unknown>;
  limits: AnyCollector["limits"];
};

export type PresetSummary = {
  id: string;
  group: PresetGroup;
  title: string;
  summary: string;
  collectorId: string;
  /** The prototype input the start form pre-fills. */
  base: Record<string, unknown>;
  /** Fields shown up front, in this order; the rest sit behind "Show settings". */
  ask: string[];
  /** The collector's fields, with this preset's hints applied. */
  fields: CollectorSummary["fields"];
};

export type RecognizeResult =
  | {
      ok: true;
      presetId: string;
      /** False when nothing recognised the address (the Custom page). */
      matched: boolean;
      /** Input to pre-fill, as text for the start page's address. */
      prefill: Record<string, string>;
    }
  | { ok: false; reason: "not_an_address" | "no_preset" };

/**
 * The title of every preset and collector by id, in the member's language,
 * including switched-off ones, so an old run keeps its name. Titles only:
 * this grants no start access.
 */
export type CatalogTitles = {
  presets: Record<string, string>;
  collectors: Record<string, string>;
};

/** Field hints as the start form reads them, in the member's language. */
function fieldSummaries(
  hints: Record<string, FieldHint>,
  locale: "en" | "nl",
): CollectorSummary["fields"] {
  return Object.entries(hints).map(([name, hint]) => ({
    ...localiseHint(name, hint, locale),
    columns: hint.columns
      ? Object.entries(hint.columns).map(([column, columnHint]) =>
          localiseHint(column, columnHint, locale),
        )
      : null,
  }));
}

/** A recognised input as text; values that are not single values are dropped. */
function asPrefill(input: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).flatMap(([name, value]) =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
        ? [[name, String(value)]]
        : [],
    ),
  );
}

type RunRow = typeof collectorRuns.$inferSelect;

function toView(row: RunRow): RunView {
  return {
    id: row.id,
    collectorId: row.collectorId,
    collectorVersion: row.collectorVersion,
    presetId: row.presetId,
    origin: row.origin,
    agentId: row.agentId,
    status: row.status,
    stopReason: row.stopReason,
    input: row.input,
    pagesFetched: row.pagesFetched,
    bytesFetched: row.bytesFetched,
    itemCount: row.itemCount,
    invalidItemCount: row.invalidItemCount,
    durationMs: row.durationMs,
    error: row.error,
    errorDetail: row.errorDetail ?? null,
    log: row.log,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

function encodeCursor(row: RunRow): string {
  return `${row.createdAt.toISOString()}_${row.id}`;
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  const at = cursor.indexOf("_");
  if (at === -1) return null;
  const createdAt = new Date(cursor.slice(0, at));
  return Number.isNaN(createdAt.getTime())
    ? null
    : { createdAt, id: cursor.slice(at + 1) };
}

/**
 * The one entry point for data collectors (Facade). The web UI (tRPC) and
 * the member's agent (MCP) both call this, so they cannot behave differently.
 * Every read is scoped to the owner; another member's run is "not found".
 */
export function createCollectorRuns(deps: CollectorRunsDeps) {
  const { db } = deps;
  const quota = deps.quota ?? DEFAULT_QUOTA;

  async function ownedRun(
    userId: string,
    runId: string,
  ): Promise<RunRow | null> {
    const [row] = await db
      .select()
      .from(collectorRuns)
      .where(and(eq(collectorRuns.id, runId), eq(collectorRuns.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async function* iterateItems(
    runId: string,
  ): AsyncIterable<Record<string, unknown>> {
    let after = -1;
    for (;;) {
      const page = await db
        .select({ seq: collectorItems.seq, data: collectorItems.data })
        .from(collectorItems)
        .where(
          and(eq(collectorItems.runId, runId), gt(collectorItems.seq, after)),
        )
        .orderBy(asc(collectorItems.seq))
        .limit(EXPORT_PAGE);
      for (const item of page) yield item.data;
      if (page.length < EXPORT_PAGE) return;
      after = page[page.length - 1]!.seq;
    }
  }

  /** The collector a start names, and the preset it came through. */
  function resolveStart(
    args: StartRunArgs,
  ): { collector: AnyCollector; presetId: string | null } | null {
    if (args.presetId !== undefined) {
      const preset = deps.presets.get(args.presetId);
      const collector = preset
        ? deps.catalog.get(preset.collectorId)
        : undefined;
      return preset && collector ? { collector, presetId: preset.id } : null;
    }
    const collector = deps.catalog.get(args.collectorId);
    return collector ? { collector, presetId: null } : null;
  }

  /** Presets whose collector is available (a switched-off collector hides them). */
  function availablePresets(): AnyPreset[] {
    return deps.presets
      .all()
      .filter((p) => deps.catalog.get(p.collectorId) !== undefined);
  }

  return {
    async usage(
      userId: string,
    ): Promise<{ runsToday: number; runsPerDay: number }> {
      return {
        runsToday: await countRunsInWindow(db, userId, deps.now()),
        runsPerDay: quota.runsPerDay,
      };
    },

    listCollectors(locale: "en" | "nl"): CollectorSummary[] {
      return deps.catalog.all().map((c) => ({
        id: c.id,
        kind: c.kind,
        title: c.title[locale],
        description: c.description[locale],
        fields: fieldSummaries(
          c.fieldHints as Record<string, FieldHint>,
          locale,
        ),
        inputJsonSchema: z.toJSONSchema(c.inputSchema),
        sampleItem: c.sampleItem,
        limits: c.limits,
      }));
    },

    listPresets(locale: "en" | "nl"): PresetSummary[] {
      return availablePresets().map((p) => {
        const collector = deps.catalog.get(p.collectorId)!;
        const hints = {
          ...(collector.fieldHints as Record<string, FieldHint>),
        };
        for (const [name, hint] of Object.entries(
          (p.hints ?? {}) as Record<string, FieldHint | undefined>,
        )) {
          if (hint) hints[name] = hint;
        }
        return {
          id: p.id,
          group: p.group,
          title: p.title[locale],
          summary: p.summary[locale],
          collectorId: p.collectorId,
          base: { ...(p.base as Record<string, unknown>) },
          ask: [...p.ask],
          fields: fieldSummaries(hints, locale),
        };
      });
    },

    /**
     * Names for runs, from the full catalogs (not the enabled lists), so a
     * run of a switched-off collector is still named, never shown as an id.
     */
    listTitles(locale: "en" | "nl"): CatalogTitles {
      return {
        presets: Object.fromEntries(
          deps.presets.all().map((p) => [p.id, p.title[locale]]),
        ),
        collectors: Object.fromEntries(
          deps.catalog.everything().map((c) => [c.id, c.title[locale]]),
        ),
      };
    },

    /** Which preset a pasted address opens. Pure: sends nothing to the site. */
    recognize(text: string): RecognizeResult {
      const url = parseAddress(text);
      if (!url) return { ok: false, reason: "not_an_address" };
      const match = recognizePreset(url, availablePresets());
      if (!match) return { ok: false, reason: "no_preset" };
      return {
        ok: true,
        presetId: match.presetId,
        matched: match.matched,
        prefill: asPrefill(match.input),
      };
    },

    async startRun(args: StartRunArgs): Promise<StartRunResult> {
      if (!deps.enabled()) {
        return {
          ok: false,
          reason: "disabled",
          message: "Data collectors are not available.",
        };
      }
      const resolved = resolveStart(args);
      if (!resolved) {
        return {
          ok: false,
          reason: "unknown_collector",
          message: "This collector does not exist.",
        };
      }
      const { collector, presetId } = resolved;
      const parsed = collector.inputSchema.safeParse(args.input);
      if (!parsed.success) {
        return {
          ok: false,
          reason: "invalid_input",
          message: "Some fields need attention.",
          fieldErrors: inputProblemsOf(parsed.error.issues),
        };
      }
      const now = deps.now();
      const result = await db.transaction(
        async (tx): Promise<StartRunResult> => {
          // Serialise starts per member so two at once cannot both pass the quota.
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${`collector-quota:${args.userId}`}))`,
          );
          const decision = await canStartRun(tx, args.userId, now, quota);
          if (!decision.allowed) {
            return {
              ok: false,
              reason: "quota",
              quotaReason: decision.reason,
              message: decision.message,
              ...(decision.retryAt
                ? { retryAt: decision.retryAt.toISOString() }
                : {}),
            };
          }
          const [row] = await tx
            .insert(collectorRuns)
            .values({
              userId: args.userId,
              agentId: args.agentId ?? null,
              origin: args.origin,
              collectorId: collector.id,
              collectorVersion: collector.version,
              presetId,
              input: parsed.data,
              status: "queued",
              createdAt: now,
              expiresAt: new Date(now.getTime() + RETENTION_MS),
            })
            .returning({ id: collectorRuns.id });
          return { ok: true, runId: row!.id };
        },
      );
      if (result.ok) {
        // The run is committed; a failed wake-up must not turn that into an
        // error. The per-minute cron picks the run up anyway.
        try {
          deps.kick();
        } catch (err) {
          console.error("[collectors] could not wake the worker", err);
        }
      }
      return result;
    },

    async getRun(userId: string, runId: string): Promise<RunView | null> {
      const row = await ownedRun(userId, runId);
      return row ? toView(row) : null;
    },

    async listRuns(
      userId: string,
      opts: { cursor?: string; limit?: number } = {},
    ): Promise<{ runs: RunView[]; nextCursor: string | null }> {
      const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
      const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;
      const rows = await db
        .select()
        .from(collectorRuns)
        .where(
          and(
            eq(collectorRuns.userId, userId),
            cursor
              ? or(
                  lt(collectorRuns.createdAt, cursor.createdAt),
                  and(
                    eq(collectorRuns.createdAt, cursor.createdAt),
                    lt(collectorRuns.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(collectorRuns.createdAt), desc(collectorRuns.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      return {
        runs: page.map(toView),
        nextCursor:
          rows.length > limit ? encodeCursor(page[page.length - 1]!) : null,
      };
    },

    async listItems(
      userId: string,
      runId: string,
      opts: { afterSeq?: number; limit?: number } = {},
    ): Promise<{
      items: Record<string, unknown>[];
      nextSeq: number | null;
    } | null> {
      if (!(await ownedRun(userId, runId))) return null;
      const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
      const rows = await db
        .select({ seq: collectorItems.seq, data: collectorItems.data })
        .from(collectorItems)
        .where(
          and(
            eq(collectorItems.runId, runId),
            gt(collectorItems.seq, opts.afterSeq ?? -1),
          ),
        )
        .orderBy(asc(collectorItems.seq))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      return {
        items: page.map((r) => r.data),
        nextSeq: rows.length > limit ? page[page.length - 1]!.seq : null,
      };
    },

    async exportRun(
      userId: string,
      runId: string,
      format: ExportFormatId,
    ): Promise<{
      filename: string;
      contentType: string;
      body: AsyncIterable<string>;
    } | null> {
      const run = await ownedRun(userId, runId);
      if (!run) return null;
      // Export still works if the collector was switched off since.
      const collector = deps.catalog
        .everything()
        .find((c) => c.id === run.collectorId);
      const formatter = EXPORT_FORMATS[format];
      return {
        filename: `${run.collectorId}-${run.id.slice(0, 8)}.${formatter.extension}`,
        contentType: formatter.contentType,
        body: formatter.write(
          iterateItems(run.id),
          collector ? columnsOf(collector) : null,
        ),
      };
    },
  };
}

export type CollectorRuns = ReturnType<typeof createCollectorRuns>;
