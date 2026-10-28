import { TRPCError } from "@trpc/server";
import { after } from "next/server";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { SUBSCRIBER_EMAIL_MAX } from "@/lib/magazines/subscriptions";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import type { Deps } from "@/server/magazines/deps";
import { issueOrigin } from "@/server/magazines/issue-origin";
import {
  findMagazineBySlug,
  findMagazineForViewer,
} from "@/server/magazines/reading";
import { defaultMagazineMailer } from "@/server/magazines/subscriptions/mail";
import {
  isAccountSubscribed,
  subscribeAccount,
  subscribeByEmail,
  unsubscribeAccount,
} from "@/server/magazines/subscriptions/service";
import { getPayloadClient } from "@/server/payload";
import { clientIpFromHeaders } from "@/server/rate-limit/client-ip";
import { createPerUserLimit } from "@/server/rate-limit/per-user-window";

const magazineRef = z.object({ magazineSlug: z.string() });
const localeInput = magazineRef.extend({ locale: z.enum(routing.locales) });
const subscriptionInput = localeInput.extend({
  sourceIssueId: z.number().int().positive().optional(),
});

async function verifiedSourceIssueId(
  deps: Deps,
  magazineId: number,
  sourceIssueId: number | undefined,
): Promise<number | null> {
  if (sourceIssueId === undefined) return null;
  const origin = await issueOrigin(deps, sourceIssueId);
  return origin?.published && origin.magazineId === magazineId
    ? origin.issueId
    : null;
}

const emailLimit = createPerUserLimit({ windowMs: 3_600_000, max: 10 });

async function requireMagazineForViewer(
  deps: Deps,
  magazineSlug: string,
  viewerId: string | null,
) {
  const found = await findMagazineForViewer(deps, { magazineSlug, viewerId });
  if (!found) throw new TRPCError({ code: "NOT_FOUND" });
  return found.magazine;
}

export const magazineSubscriptionsRouter = createTRPCRouter({
  status: publicProcedure.input(magazineRef).query(async ({ ctx, input }) => {
    const viewerId = ctx.session?.user.id ?? null;
    const deps = { db: ctx.db, payload: await getPayloadClient() };
    const magazine = await requireMagazineForViewer(
      deps,
      input.magazineSlug,
      viewerId,
    );
    return {
      signedIn: Boolean(viewerId),
      subscribed: viewerId
        ? await isAccountSubscribed(ctx.db, magazine.id, viewerId)
        : false,
    };
  }),
  subscribe: protectedProcedure
    .input(subscriptionInput)
    .mutation(async ({ ctx, input }) => {
      const deps = { db: ctx.db, payload: await getPayloadClient() };
      const magazine = await requireMagazineForViewer(
        deps,
        input.magazineSlug,
        ctx.session.user.id,
      );
      await subscribeAccount(
        ctx.db,
        magazine.id,
        ctx.session.user.id,
        input.locale,
        new Date(),
        {
          sourceIssueId: await verifiedSourceIssueId(
            deps,
            magazine.id,
            input.sourceIssueId,
          ),
        },
      );
      return { subscribed: true };
    }),
  unsubscribe: protectedProcedure
    .input(magazineRef)
    .mutation(async ({ ctx, input }) => {
      const magazine = await findMagazineBySlug(
        await getPayloadClient(),
        input.magazineSlug,
      );
      if (!magazine) throw new TRPCError({ code: "NOT_FOUND" });
      await unsubscribeAccount(ctx.db, magazine.id, ctx.session.user.id);
      return { subscribed: false };
    }),
  subscribeByEmail: publicProcedure
    .input(
      subscriptionInput.extend({
        email: z.string().trim().max(SUBSCRIBER_EMAIL_MAX),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!emailLimit(clientIpFromHeaders(ctx.headers)).allowed)
        throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
      const deps = { db: ctx.db, payload: await getPayloadClient() };
      const magazine = await requireMagazineForViewer(
        deps,
        input.magazineSlug,
        null,
      );
      const sourceIssueId = await verifiedSourceIssueId(
        deps,
        magazine.id,
        input.sourceIssueId,
      );
      (ctx.afterResponse ?? after)(async () => {
        try {
          await subscribeByEmail(
            deps,
            {
              magazine,
              email: input.email,
              locale: input.locale,
              sourceIssueId,
            },
            defaultMagazineMailer(),
            new Date(),
          );
        } catch {
          console.error("[magazines] email subscription failed");
        }
      });
      return { ok: true };
    }),
});
