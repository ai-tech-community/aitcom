import type { IssueStats } from "@/server/magazines/stats/issue-stats";

export const issueStats: IssueStats = {
  issue: {
    id: 5,
    number: 3,
    title: "Agents at work",
    publishedAt: "2026-10-01T00:00:00.000Z",
    status: "published",
  },
  views: 30,
  readers: 12,
  newSubscribers: 4,
  joins: 2,
  articles: [
    { articleId: 11, title: "Building together", readers: 10, readToEnd: 6 },
    { articleId: 12, title: "Small steps", readers: 0, readToEnd: 0 },
  ],
};
