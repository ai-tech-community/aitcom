import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { runMagazineIssueJobs } from "@/server/magazines/issue-jobs";
import { defaultMagazineMailer } from "@/server/magazines/subscriptions/mail";
import { getPayloadClient } from "@/server/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const deps = { db, payload: await getPayloadClient() };
    const result = await runMagazineIssueJobs(deps, {
      now: new Date(),
      mailer: defaultMagazineMailer(),
    });
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[magazine-issues] failed", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
