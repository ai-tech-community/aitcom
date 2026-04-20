import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { recomputeRunWeights } from "@/server/benchmark/weighting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await recomputeRunWeights(db);
    return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[benchmark-weights] error", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
