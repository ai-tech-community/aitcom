import {
  magazineShareImage,
  type ShareImageRouteContext,
} from "@/server/magazines/share-image-route";
import { createPerUserLimit } from "@/server/rate-limit/per-user-window";

export const runtime = "nodejs";
const limit = createPerUserLimit({ windowMs: 60_000, max: 30 });

export function GET(request: Request, context: ShareImageRouteContext) {
  return magazineShareImage(request, context, limit);
}
