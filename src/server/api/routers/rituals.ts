import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import { rituals, ritualOccurrences, agentDrafts } from "@/server/db/schema";
import { postRitualThread } from "@/server/communities/post-ritual-thread";

/** owner/admin/moderator may manage rituals. */
function requireManager(role: string | null) {
  if (role !== "owner" && role !== "admin" && role !== "moderator") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

const ritualInput = z.object({
  title: z.string().min(3).max(255),
  body: z.string().min(1).max(10000),
  category: z
    .enum(["general", "question", "showcase", "job"])
    .default("general"),
  weekday: z.number().int().min(0).max(6),
  mode: z.enum(["auto", "review"]).default("review"),
});

export const ritualsRouter = createTRPCRouter({
  list: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireManager(ctx.communityRole);
      return ctx.db
        .select()
        .from(rituals)
        .where(eq(rituals.communityId, ctx.community.id))
        .orderBy(desc(rituals.createdAt));
    }),

  create: communityProcedure
    .input(ritualInput.extend({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.communityRole);
      const [r] = await ctx.db
        .insert(rituals)
        .values({
          communityId: ctx.community.id,
          authorUserId: ctx.session.user.id,
          title: input.title,
          body: input.body,
          category: input.category,
          weekday: input.weekday,
          mode: input.mode,
        })
        .returning({ id: rituals.id });
      return { ritualId: r!.id };
    }),

  update: communityProcedure
    .input(
      ritualInput.partial().extend({ slug: z.string(), ritualId: z.string() }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.communityRole);
      const { slug: _slug, ritualId, ...fields } = input;
      await ctx.db
        .update(rituals)
        .set(fields)
        .where(
          and(
            eq(rituals.id, ritualId),
            eq(rituals.communityId, ctx.community.id),
          ),
        );
      return { ok: true };
    }),

  setStatus: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        ritualId: z.string(),
        status: z.enum(["active", "paused"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.communityRole);
      await ctx.db
        .update(rituals)
        .set({ status: input.status })
        .where(
          and(
            eq(rituals.id, input.ritualId),
            eq(rituals.communityId, ctx.community.id),
          ),
        );
      return { ok: true };
    }),

  pendingOccurrences: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireManager(ctx.communityRole);
      return ctx.db
        .select({
          id: ritualOccurrences.id,
          ritualId: ritualOccurrences.ritualId,
          scheduledFor: ritualOccurrences.scheduledFor,
          title: rituals.title,
          body: rituals.body,
        })
        .from(ritualOccurrences)
        .innerJoin(rituals, eq(rituals.id, ritualOccurrences.ritualId))
        .where(
          and(
            eq(ritualOccurrences.communityId, ctx.community.id),
            eq(ritualOccurrences.status, "pending"),
          ),
        )
        .orderBy(desc(ritualOccurrences.createdAt));
    }),

  approveOccurrence: communityProcedure
    .input(z.object({ slug: z.string(), occurrenceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.communityRole);
      // Load + verify still-pending (do NOT flip yet).
      const [occ] = await ctx.db
        .select()
        .from(ritualOccurrences)
        .where(
          and(
            eq(ritualOccurrences.id, input.occurrenceId),
            eq(ritualOccurrences.communityId, ctx.community.id),
            eq(ritualOccurrences.status, "pending"),
          ),
        )
        .limit(1);
      if (!occ) throw new TRPCError({ code: "NOT_FOUND" });

      const [r] = await ctx.db
        .select()
        .from(rituals)
        .where(eq(rituals.id, occ.ritualId))
        .limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });

      // Create the thread FIRST (so a failure leaves the occurrence pending).
      const threadId = await postRitualThread(ctx.db, r);

      // CAS flip pending->posted only on success; if someone else already
      // acted, this matches 0 rows (the thread is orphaned but no false "posted").
      const updated = await ctx.db
        .update(ritualOccurrences)
        .set({ status: "posted", threadId, postedAt: new Date() })
        .where(
          and(
            eq(ritualOccurrences.id, occ.id),
            eq(ritualOccurrences.status, "pending"),
          ),
        )
        .returning({ id: ritualOccurrences.id });
      if (updated.length === 0) {
        // Lost a race (concurrent approve/skip). Thread was created but the
        // occurrence is no longer pending — surface a conflict.
        throw new TRPCError({
          code: "CONFLICT",
          message: "Occurrence already actioned",
        });
      }
      return { threadId };
    }),

  skipOccurrence: communityProcedure
    .input(z.object({ slug: z.string(), occurrenceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.communityRole);
      await ctx.db
        .update(ritualOccurrences)
        .set({ status: "skipped" })
        .where(
          and(
            eq(ritualOccurrences.id, input.occurrenceId),
            eq(ritualOccurrences.communityId, ctx.community.id),
            eq(ritualOccurrences.status, "pending"),
          ),
        );
      return { ok: true };
    }),

  pendingSuggestions: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireManager(ctx.communityRole);
      const rows = await ctx.db
        .select()
        .from(agentDrafts)
        .where(
          and(
            eq(agentDrafts.type, "ritual_suggestion"),
            eq(agentDrafts.status, "pending"),
            sql`${agentDrafts.metadata}->>'communityId' = ${ctx.community.id}`,
          ),
        )
        .orderBy(desc(agentDrafts.createdAt));
      return rows.map((d) => {
        const m = (d.metadata ?? {}) as {
          title?: string;
          body?: string;
          category?: string;
          weekday?: number;
          mode?: string;
        };
        return {
          draftId: d.id,
          title: m.title ?? d.content,
          body: m.body ?? "",
          category: m.category ?? "general",
          weekday: m.weekday ?? 1,
          mode: m.mode ?? "review",
          createdAt: d.createdAt,
        };
      });
    }),

  reviewSuggestion: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        draftId: z.string(),
        action: z.enum(["approved", "rejected"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.communityRole);

      // Read + authorize BEFORE any mutation.
      const [existing] = await ctx.db
        .select()
        .from(agentDrafts)
        .where(
          and(
            eq(agentDrafts.id, input.draftId),
            eq(agentDrafts.type, "ritual_suggestion"),
          ),
        )
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const meta = (existing.metadata ?? {}) as {
        communityId?: string;
        title?: string;
        body?: string;
        category?: string;
        weekday?: number;
        mode?: string;
      };
      if (meta.communityId !== ctx.community.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // CAS claim: only flip a still-pending draft.
      const [draft] = await ctx.db
        .update(agentDrafts)
        .set({ status: input.action })
        .where(
          and(
            eq(agentDrafts.id, input.draftId),
            eq(agentDrafts.type, "ritual_suggestion"),
            eq(agentDrafts.status, "pending"),
          ),
        )
        .returning();
      if (!draft) throw new TRPCError({ code: "CONFLICT" });

      if (input.action === "rejected") return { ok: true, ritualId: null };

      const [r] = await ctx.db
        .insert(rituals)
        .values({
          communityId: ctx.community.id,
          authorUserId: ctx.session.user.id,
          suggestedByAgentId: draft.agentId,
          title: meta.title ?? draft.content,
          body: meta.body ?? draft.content,
          category: meta.category ?? "general",
          weekday: meta.weekday ?? 1,
          mode: meta.mode === "auto" ? "auto" : "review",
        })
        .returning({ id: rituals.id });
      return { ok: true, ritualId: r!.id };
    }),
});
