import {
  collectorAgentAccess,
  setCollectorAgentAccess,
} from "@/server/collectors/agent-permission";
import { asc, eq } from "drizzle-orm";
import { canonicalOptOutDomain } from "@/lib/collectors/opt-out-domain";
import { collectorBlockedDomains } from "@/server/db/schema";
import { routing } from "@/i18n/routing";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  agentProcedure,
  requireOwner,
  requireScope,
} from "@/server/api/trpc";
import { liveCollectorRuns } from "@/server/collectors/live";

/** How many recent runs the landing shows. */
const RECENT_RUNS = 5;

function runNotFound(): never {
  throw new TRPCError({ code: "NOT_FOUND", message: "RUN_NOT_FOUND" });
}

async function isFirstTime(
  runs: ReturnType<typeof liveCollectorRuns>,
  userId: string,
) {
  const { runs: latest } = await runs.listRuns(userId, { limit: 1 });
  return latest.length === 0;
}

function isStaff(user: unknown): boolean {
  return (user as { role?: string }).role === "admin";
}
const domainInput = z
  .string()
  .max(255)
  .refine((value) => canonicalOptOutDomain(value) !== null, "DOMAIN_INVALID")
  .transform((value) => canonicalOptOutDomain(value)!);
function requireStaff(user: unknown) {
  if (!isStaff(user)) throw new TRPCError({ code: "FORBIDDEN" });
}

/**
 * The web's adapter over the CollectorRuns facade (ADR-0040). It adds only
 * the first-use acknowledgement; ownership, quota and validation live in
 * the facade, so MCP behaves the same.
 */
export const collectorsRouter = createTRPCRouter({
  agentAccess: protectedProcedure.query(({ ctx }) => {
    return collectorAgentAccess(ctx.db, ctx.session.user.id);
  }),
  setAgentAccess: protectedProcedure
    .input(z.object({ allowed: z.boolean(), acknowledged: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.allowed && !input.acknowledged)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ACKNOWLEDGEMENT_REQUIRED",
        });
      if (
        !(await setCollectorAgentAccess(
          ctx.db,
          ctx.session.user.id,
          input.allowed,
        ))
      )
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "AGENT_KEY_NOT_FOUND",
        });
      return { ok: true };
    }),
  agentList: agentProcedure
    .input(z.object({ locale: z.enum(routing.locales).default("en") }))
    .query(({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "collect");
      requireOwner(ctx.agent.ownerId);
      return liveCollectorRuns().listCollectors(input.locale);
    }),
  agentStart: agentProcedure
    .input(
      z.object({ collectorId: z.string().min(1).max(64), input: z.unknown() }),
    )
    .mutation(({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "collect");
      const userId = requireOwner(ctx.agent.ownerId);
      return liveCollectorRuns().startRun({
        userId,
        agentId: ctx.agent.agentId,
        origin: "mcp",
        ...input,
      });
    }),
  agentRun: agentProcedure
    .input(z.object({ runId: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "collect");
      const userId = requireOwner(ctx.agent.ownerId);
      return (
        (await liveCollectorRuns().getRun(userId, input.runId)) ?? runNotFound()
      );
    }),
  agentItems: agentProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(255),
        afterSeq: z.number().int().min(-1).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "collect");
      const userId = requireOwner(ctx.agent.ownerId);
      const { runId, ...page } = input;
      return (
        (await liveCollectorRuns().listItems(userId, runId, page)) ??
        runNotFound()
      );
    }),
  optOuts: protectedProcedure.query(async ({ ctx }) => {
    requireStaff(ctx.session.user);
    return ctx.db
      .select()
      .from(collectorBlockedDomains)
      .orderBy(asc(collectorBlockedDomains.domain));
  }),
  addOptOut: protectedProcedure
    .input(
      z.object({
        domain: domainInput,
        reason: z.string().trim().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireStaff(ctx.session.user);
      await ctx.db
        .insert(collectorBlockedDomains)
        .values(input)
        .onConflictDoUpdate({
          target: collectorBlockedDomains.domain,
          set: { reason: input.reason },
        });
      return { ok: true };
    }),
  removeOptOut: protectedProcedure
    .input(z.object({ domain: domainInput }))
    .mutation(async ({ ctx, input }) => {
      requireStaff(ctx.session.user);
      await ctx.db
        .delete(collectorBlockedDomains)
        .where(eq(collectorBlockedDomains.domain, input.domain));
      return { ok: true };
    }),
  overview: protectedProcedure
    .input(z.object({ locale: z.enum(routing.locales) }))
    .query(async ({ ctx, input }) => {
      const runs = liveCollectorRuns();
      const userId = ctx.session.user.id;
      const [recent, usage] = await Promise.all([
        runs.listRuns(userId, { limit: RECENT_RUNS }),
        runs.usage(userId),
      ]);
      return {
        collectors: runs.listCollectors(input.locale),
        presets: runs.listPresets(input.locale),
        // Names for runs whose preset or collector is switched off.
        titles: runs.listTitles(input.locale),
        recentRuns: recent.runs,
        usage,
        canManageOptOuts: isStaff(ctx.session.user),
        needsAcknowledgement: recent.runs.length === 0,
      };
    }),

  /** Which preset a pasted address opens. Never fetches the address. */
  recognize: protectedProcedure
    .input(z.object({ address: z.string().max(4_096) }))
    .query(({ input }) => liveCollectorRuns().recognize(input.address)),

  start: protectedProcedure
    .input(
      z.object({
        presetId: z.string().min(1).max(64),
        input: z.unknown(),
        acknowledged: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const runs = liveCollectorRuns();
      const userId = ctx.session.user.id;
      if (!input.acknowledged && (await isFirstTime(runs, userId))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ACKNOWLEDGEMENT_REQUIRED",
        });
      }
      return runs.startRun({
        userId,
        origin: "web",
        presetId: input.presetId,
        input: input.input,
      });
    }),

  run: protectedProcedure
    .input(z.object({ runId: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      return (
        (await liveCollectorRuns().getRun(ctx.session.user.id, input.runId)) ??
        runNotFound()
      );
    }),

  runs: protectedProcedure
    .input(
      z.object({
        cursor: z.string().max(300).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      liveCollectorRuns().listRuns(ctx.session.user.id, input),
    ),

  items: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(255),
        afterSeq: z.number().int().min(-1).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { runId, ...page } = input;
      return (
        (await liveCollectorRuns().listItems(
          ctx.session.user.id,
          runId,
          page,
        )) ?? runNotFound()
      );
    }),
});
