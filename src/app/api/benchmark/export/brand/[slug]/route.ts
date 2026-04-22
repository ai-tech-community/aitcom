import { NextResponse } from "next/server";
import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { serializeBrandStatsCsv } from "@/server/benchmark/csv-serializer";
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

  if (!ALLOWED_WINDOWS.has(windowRaw)) {
    return NextResponse.json(
      { error: "invalid-window", allowed: [7, 30, 90] },
      { status: 400 },
    );
  }
  const windowDays = windowRaw as 7 | 30 | 90;

  const ctx = await createTRPCContext({ headers: new Headers(req.headers) });
  const caller = createCaller(ctx);
  const stats = await caller.benchmark.brands.stats({
    slug,
    window: windowDays,
  });

  if (!stats) {
    return NextResponse.json({ error: "brand-not-found" }, { status: 404 });
  }

  // Best-effort: use the single overall top domain for every model row.
  const topDomain = stats.citations[0]?.domain;
  const topDomainsByModel: Record<string, string> = {};
  for (const r of stats.perModel) {
    if (topDomain) topDomainsByModel[r.modelId] = topDomain;
  }

  const csv = serializeBrandStatsCsv({
    perModel: stats.perModel.map((r) => ({
      modelId: r.modelId,
      mentionsCount: r.mentionsCount,
      runsTotal: r.runsTotal,
      visibilityPct: r.visibilityPct,
      avgRank: r.avgRank,
      sentimentPosPct: r.sentimentPosPct,
      sentimentNeuPct: r.sentimentNeuPct,
      sentimentNegPct: r.sentimentNegPct,
    })),
    topDomainsByModel,
  });

  const filename = `${slug}-${windowDays}d.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "public, max-age=60",
    },
  });
}
