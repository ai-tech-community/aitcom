import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";

import {
  createTRPCRouter,
  communityProcedure,
  requireConfigAdmin,
} from "@/server/api/trpc";
import {
  communityOnboardingStep,
  communityOnboardingProgress,
} from "@/server/db/schema";

function requireActiveMember(membership: { status: string } | null) {
  if (membership?.status !== "active") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

const hrefSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (h) =>
      (h.startsWith("/") && !h.startsWith("//") && !h.startsWith("/\\")) ||
      h.startsWith("https://"),
    { message: "href must be a same-site path (/...) or an https:// URL" },
  );

export const onboardingStepsRouter = createTRPCRouter({
  list: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireConfigAdmin(ctx.communityRole);
      return ctx.db
        .select()
        .from(communityOnboardingStep)
        .where(eq(communityOnboardingStep.communityId, ctx.community.id))
        .orderBy(asc(communityOnboardingStep.position));
    }),

  create: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        title: z.string().min(1).max(255),
        href: hrefSchema,
        position: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireConfigAdmin(ctx.communityRole);
      const [s] = await ctx.db
        .insert(communityOnboardingStep)
        .values({
          communityId: ctx.community.id,
          title: input.title,
          href: input.href,
          position: input.position,
        })
        .returning({ id: communityOnboardingStep.id });
      return { stepId: s!.id };
    }),

  update: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        stepId: z.string(),
        title: z.string().min(1).max(255).optional(),
        href: hrefSchema.optional(),
        position: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireConfigAdmin(ctx.communityRole);
      const { slug: _slug, stepId, ...rawFields } = input;
      const fields = Object.fromEntries(
        Object.entries(rawFields).filter(([, v]) => v !== undefined),
      );
      if (Object.keys(fields).length === 0) return { ok: true };
      await ctx.db
        .update(communityOnboardingStep)
        .set(
          fields as Partial<{ title: string; href: string; position: number }>,
        )
        .where(
          and(
            eq(communityOnboardingStep.id, stepId),
            eq(communityOnboardingStep.communityId, ctx.community.id),
          ),
        );
      return { ok: true };
    }),

  reorder: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        stepId: z.string(),
        direction: z.enum(["up", "down"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireConfigAdmin(ctx.communityRole);
      // Load the target step, scoped to this community.
      const [step] = await ctx.db
        .select({
          id: communityOnboardingStep.id,
          position: communityOnboardingStep.position,
        })
        .from(communityOnboardingStep)
        .where(
          and(
            eq(communityOnboardingStep.id, input.stepId),
            eq(communityOnboardingStep.communityId, ctx.community.id),
          ),
        )
        .limit(1);
      if (!step) throw new TRPCError({ code: "NOT_FOUND" });

      // Find the adjacent sibling by position within the community.
      // "up" => the nearest step above (highest position below this one).
      // "down" => the nearest step below (lowest position above this one).
      const [neighbor] = await ctx.db
        .select({
          id: communityOnboardingStep.id,
          position: communityOnboardingStep.position,
        })
        .from(communityOnboardingStep)
        .where(
          and(
            eq(communityOnboardingStep.communityId, ctx.community.id),
            input.direction === "up"
              ? lt(communityOnboardingStep.position, step.position)
              : gt(communityOnboardingStep.position, step.position),
          ),
        )
        .orderBy(
          input.direction === "up"
            ? desc(communityOnboardingStep.position)
            : asc(communityOnboardingStep.position),
        )
        .limit(1);

      // Already at the top/bottom — nothing to swap.
      if (!neighbor) return { ok: true };

      // Swap positions. (communityId, position) is a plain index (not unique),
      // so a direct two-row swap is safe even without a transaction.
      await ctx.db
        .update(communityOnboardingStep)
        .set({ position: neighbor.position })
        .where(
          and(
            eq(communityOnboardingStep.id, step.id),
            eq(communityOnboardingStep.communityId, ctx.community.id),
          ),
        );
      await ctx.db
        .update(communityOnboardingStep)
        .set({ position: step.position })
        .where(
          and(
            eq(communityOnboardingStep.id, neighbor.id),
            eq(communityOnboardingStep.communityId, ctx.community.id),
          ),
        );
      return { ok: true };
    }),

  remove: communityProcedure
    .input(z.object({ slug: z.string(), stepId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireConfigAdmin(ctx.communityRole);
      // Validate the step belongs to this community before deleting its progress.
      const [step] = await ctx.db
        .select({ id: communityOnboardingStep.id })
        .from(communityOnboardingStep)
        .where(
          and(
            eq(communityOnboardingStep.id, input.stepId),
            eq(communityOnboardingStep.communityId, ctx.community.id),
          ),
        )
        .limit(1);
      if (!step) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db
        .delete(communityOnboardingProgress)
        .where(eq(communityOnboardingProgress.stepId, input.stepId));
      await ctx.db
        .delete(communityOnboardingStep)
        .where(
          and(
            eq(communityOnboardingStep.id, input.stepId),
            eq(communityOnboardingStep.communityId, ctx.community.id),
          ),
        );
      return { ok: true };
    }),

  listForMe: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireActiveMember(ctx.membership);
      const userId = ctx.session.user.id;
      const [steps, done] = await Promise.all([
        ctx.db
          .select()
          .from(communityOnboardingStep)
          .where(eq(communityOnboardingStep.communityId, ctx.community.id))
          .orderBy(asc(communityOnboardingStep.position)),
        ctx.db
          .select({ stepId: communityOnboardingProgress.stepId })
          .from(communityOnboardingProgress)
          .where(
            and(
              eq(communityOnboardingProgress.communityId, ctx.community.id),
              eq(communityOnboardingProgress.userId, userId),
            ),
          ),
      ]);
      const doneSet = new Set(done.map((d) => d.stepId));
      return steps.map((s) => ({
        id: s.id,
        title: s.title,
        href: s.href,
        position: s.position,
        completed: doneSet.has(s.id),
      }));
    }),

  markComplete: communityProcedure
    .input(z.object({ slug: z.string(), stepId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireActiveMember(ctx.membership);
      const userId = ctx.session.user.id;
      const [step] = await ctx.db
        .select({ id: communityOnboardingStep.id })
        .from(communityOnboardingStep)
        .where(
          and(
            eq(communityOnboardingStep.id, input.stepId),
            eq(communityOnboardingStep.communityId, ctx.community.id),
          ),
        )
        .limit(1);
      if (!step) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db
        .insert(communityOnboardingProgress)
        .values({
          communityId: ctx.community.id,
          userId,
          stepId: input.stepId,
        })
        .onConflictDoNothing();
      return { ok: true };
    }),
});
