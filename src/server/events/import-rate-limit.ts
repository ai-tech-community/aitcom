// Per-user rate limit for the event link-importer. The importer makes
// outbound fetches and can create media docs, so we cap how often a single
// user can trigger it.
import { createPerUserLimit } from "@/server/rate-limit/per-user-window";

export const checkEventImportRateLimit = createPerUserLimit({
  windowMs: 3_600_000, // 1 hour
  max: 20,
});
