import { NextResponse } from "next/server";
import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import {
  checkPublicApiRateLimit,
  getClientIp,
  isSameOriginRequest,
} from "@/server/benchmark/public-rate-limit";

const ALLOWED_WINDOWS = new Set([7, 30, 90]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isSameOriginRequest(req)) {
    const ip = getClientIp(req);
    const rl = checkPublicApiRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate-limited", retryAfter: rl.retryAfterSecs },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
      );
    }
  }

  const { slug } = await params;
  const url = new URL(req.url);
  const windowRaw = Number(url.searchParams.get("window") ?? "30");
  const modelId = url.searchParams.get("modelId") ?? undefined;

  if (!ALLOWED_WINDOWS.has(windowRaw)) {
    return NextResponse.json(
      { error: "invalid-window", allowed: [7, 30, 90] },
      { status: 400 },
    );
  }

  const ctx = await createTRPCContext({ headers: new Headers(req.headers) });
  const caller = createCaller(ctx);
  const stats = await caller.benchmark.brands.stats({
    slug,
    window: windowRaw as 7 | 30 | 90,
    modelId,
  });

  if (!stats) {
    return NextResponse.json({ error: "brand-not-found" }, { status: 404 });
  }

  return NextResponse.json({ version: "v1-unstable", ...stats });
}
