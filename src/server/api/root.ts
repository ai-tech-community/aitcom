import { communityRouter } from "@/server/api/routers/community";
import { eventsRouter } from "@/server/api/routers/events";
import { membersRouter } from "@/server/api/routers/members";
import { postRouter } from "@/server/api/routers/post";
import { sponsorsRouter } from "@/server/api/routers/sponsors";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  events: eventsRouter,
  members: membersRouter,
  community: communityRouter,
  sponsors: sponsorsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
