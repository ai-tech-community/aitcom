import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { db as appDb } from "@/server/db";
import { collectorItems, collectorRuns } from "@/server/db/schema";

import { allCollectors, columnsOf } from "./catalog";
import type { AnyCollector, FieldHint } from "./collector";
import { EXPORT_FORMATS, type ExportFormatId } from "./export/formats";
import {
  DEFAULT_QUOTA,
  type QuotaLimits,
  canStartRun,
  countRunsInWindow,
} from "./quota";
import type { FailureDetail } from "./errors";
import type { RunStatus, StopReason } from "./run-status";

const RETENTION_MS = 30 * 86_400_000;
const EXPORT_PAGE = 500;

export interface CollectorCatalogPort {
  all(): readonly AnyCollector[];
  get(id: string): AnyCollector | undefined;
}

export interface CollectorRunsDeps {
  db: typeof appDb;
  enabled(): boolean;
  catalog: CollectorCatalogPort;
  /** Best-effort wake of the worker; the per-minute cron is the guarantee. */
  kick(): void;
  now(): Date;
  quota?: QuotaLimits;
}

export type StartRunResult =
  | { ok: true; runId: string }
  | {
      ok: false;
      reason: "disabled" | "unknown_collector" | "invalid_input" | "quota";
      message: string;
      fieldErrors?: Record<string, string[]>;
      /** Quota only: which limit refused the start. */
      quotaReason?: "daily_limit" | "active_limit" | "platform_busy";
      /** Quota only: when a new start will be allowed (ISO 8601), if known. */
      retryAt?: string;
    };

export type RunView = {
  id: string;
  collectorId: string;
  collectorVersion: number;
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

export type CollectorSummary = {
  id: string;
  kind: AnyCollector["kind"];
  title: string;
  description: string;
  fields: {
    name: string;
    label: string;
    help: string | null;
    placeholder: string | null;
  }[];
  inputJsonSchema: unknown;
  sampleItem: Record<string, unknown>;
  limits: AnyCollector["limits"];
};

type RunRow = typeof collectorRuns.$inferSelect;

function toView(row: RunRow): RunView {
  return {
    id: row.id,
    collectorId: row.collectorId,
    collectorVersion: row.collectorVersion,
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
        fields: Object.entries(c.fieldHints as Record<string, FieldHint>).map(
          ([name, hint]) => ({
            name,
            label: hint.label[locale],
            help: hint.help?.[locale] ?? null,
            placeholder: hint.placeholder ?? null,
          }),
        ),
        inputJsonSchema: z.toJSONSchema(c.inputSchema),
        sampleItem: c.sampleItem,
        limits: c.limits,
      }));
    },

    async startRun(args: {
      userId: string;
      agentId?: string | null;
      origin: "web" | "mcp";
      collectorId: string;
      input: unknown;
    }): Promise<StartRunResult> {
      if (!deps.enabled()) {
        return {
          ok: false,
          reason: "disabled",
          message: "Data collectors are not available.",
        };
      }
      const collector = deps.catalog.get(args.collectorId);
      if (!collector) {
        return {
          ok: false,
          reason: "unknown_collector",
          message: "This collector does not exist.",
        };
      }
      const parsed = collector.inputSchema.safeParse(args.input);
      if (!parsed.success) {
        return {
          ok: false,
          reason: "invalid_input",
          message: "Some fields need attention.",
          fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<
            string,
            string[]
          >,
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
      const collector = allCollectors().find((c) => c.id === run.collectorId);
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
