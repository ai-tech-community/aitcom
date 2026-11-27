import { TRPCError } from "@trpc/server";
import { and, eq, or, isNotNull } from "drizzle-orm";
import { z } from "zod";
import {
  communityProcedure,
  createTRPCRouter,
  requireConfigAdmin,
} from "@/server/api/trpc";
import { communityNewsFeeds, newsFeeds } from "@/server/db/schema";
import { discoverFeed } from "@/server/news/discover-feed";

const admin = communityProcedure
  .input(z.object({ slug: z.string() }))
  .use(({ ctx, next }) => {
    requireConfigAdmin(ctx.communityRole);
    return next();
  });
const address = z.object({ url: z.string().trim().url().max(2048) });
const feedKey = z.object({ feedId: z.string().min(1).max(255) });
const unavailable = () =>
  new TRPCError({ code: "BAD_REQUEST", message: "This feed is unavailable." });

export const communitySourcesRouter = createTRPCRouter({
  list: admin.query(({ ctx }) =>
    ctx.db
      .select({
        id: newsFeeds.id,
        name: newsFeeds.name,
        url: newsFeeds.url,
        selected: communityNewsFeeds.feedId,
      })
      .from(newsFeeds)
      .leftJoin(
        communityNewsFeeds,
        and(
          eq(communityNewsFeeds.feedId, newsFeeds.id),
          eq(communityNewsFeeds.communityId, ctx.community.id),
        ),
      )
      .where(
        or(eq(newsFeeds.enabled, true), isNotNull(communityNewsFeeds.feedId)),
      )
      .orderBy(newsFeeds.name, newsFeeds.url),
  ),
  preview: admin
    .input(address)
    .mutation(({ input }) => discoverFeed(input.url)),
  add: admin.input(address).mutation(async ({ ctx, input }) => {
    const feed = await discoverFeed(input.url);
    if (feed.kind !== "feed") throw unavailable();
    await ctx.db.transaction(async (tx) => {
      await tx
        .insert(newsFeeds)
        .values({ name: feed.name, url: feed.url, sector: "other" })
        .onConflictDoNothing({ target: newsFeeds.url });
      const [existing] = await tx
        .select({ id: newsFeeds.id })
        .from(newsFeeds)
        .where(and(eq(newsFeeds.url, feed.url), eq(newsFeeds.enabled, true)))
        .for("share");
      if (!existing) throw unavailable();
      await tx
        .insert(communityNewsFeeds)
        .values({ communityId: ctx.community.id, feedId: existing.id })
        .onConflictDoNothing();
    });
  }),
  select: admin.input(feedKey).mutation(async ({ ctx, input }) => {
    await ctx.db.transaction(async (tx) => {
      const [feed] = await tx
        .select({ id: newsFeeds.id })
        .from(newsFeeds)
        .where(and(eq(newsFeeds.id, input.feedId), eq(newsFeeds.enabled, true)))
        .for("share");
      if (!feed) throw unavailable();
      await tx
        .insert(communityNewsFeeds)
        .values({ communityId: ctx.community.id, feedId: feed.id })
        .onConflictDoNothing();
    });
  }),
  remove: admin.input(feedKey).mutation(async ({ ctx, input }) => {
    await ctx.db
      .delete(communityNewsFeeds)
      .where(
        and(
          eq(communityNewsFeeds.communityId, ctx.community.id),
          eq(communityNewsFeeds.feedId, input.feedId),
        ),
      );
  }),
});
