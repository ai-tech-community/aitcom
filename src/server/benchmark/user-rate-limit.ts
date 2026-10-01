// src/server/benchmark/user-rate-limit.ts
import { createPerUserLimit } from "@/server/rate-limit/per-user-window";

export const checkSuggestPromptsRateLimit = createPerUserLimit({
  windowMs: 3_600_000, // 1 hour
  max: 10,
});

export const checkStrategyRateLimit = createPerUserLimit({
  windowMs: 3_600_000, // 1 hour
  max: 5,
});
