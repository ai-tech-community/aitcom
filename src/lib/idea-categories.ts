export const IDEA_CATEGORIES = ["platform", "agent-capability"] as const;

export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];
