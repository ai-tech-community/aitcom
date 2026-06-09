import { activityRouter } from "@/server/api/routers/activity";
import { communitiesRouter } from "@/server/api/routers/communities";
import { feedRouter } from "./routers/feed";
import { commentsRouter } from "@/server/api/routers/comments";
import { commissionsRouter } from "@/server/api/routers/commissions";
import { benchmarkRouter } from "@/server/api/routers/benchmark";
import { launchpadRouter } from "@/server/api/routers/launchpad";
import { agentRouter } from "@/server/api/routers/agent";
import { agentManagementRouter } from "@/server/api/routers/agent-management";
import { articlesRouter } from "@/server/api/routers/articles";
import { challengeChannelRouter } from "@/server/api/routers/challenge-channel";
import { challengeEngineRouter } from "@/server/api/routers/challenge-engine";
import { challengesRouter } from "@/server/api/routers/challenges";
import { forumRouter } from "@/server/api/routers/forum";
import { eventsRouter } from "@/server/api/routers/events";
import { lumaRouter } from "@/server/api/routers/luma";
import { membersRouter } from "@/server/api/routers/members";
import { inboxRouter } from "@/server/api/routers/inbox";
import { impactRouter } from "@/server/api/routers/impact";
import { notificationsRouter } from "@/server/api/routers/notifications";
import { notificationPrefsRouter } from "@/server/api/routers/notificationPrefs";
import { onboardingRouter } from "@/server/api/routers/onboarding";
import { postRouter } from "@/server/api/routers/post";
import { sponsorsRouter } from "@/server/api/routers/sponsors";
import { datacentersRouter } from "@/server/api/routers/datacenters";
import { insightsRouter } from "@/server/api/routers/insights";
import { discoveryRouter } from "@/server/api/routers/discovery";
import { broadcastRouter } from "@/server/api/routers/broadcast";
import { hubOperatorRouter } from "@/server/api/routers/hubOperator";
import { advisoryRouter } from "@/server/api/routers/advisory";
import { ritualsRouter } from "@/server/api/routers/rituals";
import { engageConfigRouter } from "@/server/api/routers/engageConfig";
import { activationConfigRouter } from "@/server/api/routers/activationConfig";
import { activationRouter } from "@/server/api/routers/activation";
import { acquireConfigRouter } from "@/server/api/routers/acquireConfig";
import { referralRouter } from "@/server/api/routers/referral";
import { onboardingStepsRouter } from "@/server/api/routers/onboardingSteps";
import { workGridRouter } from "@/server/api/routers/work-grid";
import { hackathonRouter } from "@/server/api/routers/hackathon";
import { topicsRouter } from "@/server/api/routers/topics";
import { linksRouter } from "@/server/api/routers/links";
import { classroomsRouter } from "@/server/api/routers/classrooms";
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
  forum: forumRouter,
  sponsors: sponsorsRouter,
  articles: articlesRouter,
  agentManagement: agentManagementRouter,
  agent: agentRouter,
  activity: activityRouter,
  inbox: inboxRouter,
  impact: impactRouter,
  notifications: notificationsRouter,
  notificationPrefs: notificationPrefsRouter,
  onboarding: onboardingRouter,
  challengeChannel: challengeChannelRouter,
  challengeEngine: challengeEngineRouter,
  challenges: challengesRouter,
  benchmark: benchmarkRouter,
  launchpad: launchpadRouter,
  comments: commentsRouter,
  commissions: commissionsRouter,
  communities: communitiesRouter,
  feed: feedRouter,
  luma: lumaRouter,
  datacenters: datacentersRouter,
  insights: insightsRouter,
  discovery: discoveryRouter,
  referral: referralRouter,
  broadcast: broadcastRouter,
  hubOperator: hubOperatorRouter,
  advisory: advisoryRouter,
  rituals: ritualsRouter,
  engageConfig: engageConfigRouter,
  activationConfig: activationConfigRouter,
  activation: activationRouter,
  onboardingSteps: onboardingStepsRouter,
  acquireConfig: acquireConfigRouter,
  workGrid: workGridRouter,
  hackathon: hackathonRouter,
  topics: topicsRouter,
  links: linksRouter,
  classrooms: classroomsRouter,
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
