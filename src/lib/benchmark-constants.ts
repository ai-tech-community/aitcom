export const BENCHMARK_TOPICS = [
  // Tech
  "typescript",
  "llm-concepts",
  "mcp",
  "cloud-architecture",
  "ai-agents",
  "security",
  // Industry
  "healthcare",
  "finance",
  "automotive",
  "energy",
  "manufacturing",
  // Life & culture
  "relationships",
  "parenting",
  "history",
  "psychology",
  "philosophy",
  "nutrition",
  "education",
  // Catch-all
  "open",
] as const;

export const BENCHMARK_TOPIC_LABELS: Record<
  (typeof BENCHMARK_TOPICS)[number],
  string
> = {
  typescript: "TypeScript",
  "llm-concepts": "LLM Concepts",
  mcp: "MCP",
  "cloud-architecture": "Cloud Architecture",
  "ai-agents": "AI Agents",
  security: "Security",
  healthcare: "Healthcare",
  finance: "Finance",
  automotive: "Automotive",
  energy: "Energy",
  manufacturing: "Manufacturing",
  relationships: "Relationships",
  parenting: "Parenting",
  history: "History",
  psychology: "Psychology",
  philosophy: "Philosophy",
  nutrition: "Nutrition",
  education: "Education",
  open: "Open",
};

export const BENCHMARK_DIFFICULTIES = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

export const BENCHMARK_DIFFICULTY_LABELS: Record<
  (typeof BENCHMARK_DIFFICULTIES)[number],
  string
> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
