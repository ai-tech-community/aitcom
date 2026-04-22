import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  aggBrandVisibilityByModel,
  brandWatches,
  brands,
  user,
} from "@/server/db/schema";
import {
  detectBrandShifts,
  sendBrandAlertEmail,
} from "@/server/benchmark/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Silence window: don't re-notify a watch more than once per N hours.
const SILENCE_HOURS = 24;
const THRESHOLD_PTS = 10;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Pull 7d + 30d rows from the visibility aggregate.
    const rows = await db
      .select({
        brandId: aggBrandVisibilityByModel.brandId,
        windowDays: aggBrandVisibilityByModel.windowDays,
        mentionsCount: aggBrandVisibilityByModel.mentionsCount,
        runsTotal: aggBrandVisibilityByModel.runsTotal,
      })
      .from(aggBrandVisibilityByModel);

    const shifts = detectBrandShifts(
      rows.map((r) => ({
        brandId: r.brandId,
        windowDays: r.windowDays,
        mentionsCount: r.mentionsCount,
        runsTotal: r.runsTotal,
      })),
      THRESHOLD_PTS,
    );

    if (shifts.length === 0) {
      return NextResponse.json({
        success: true,
        shifts: 0,
        notified: 0,
        timestamp: new Date().toISOString(),
      });
    }

    const shiftByBrand = new Map(shifts.map((s) => [s.brandId, s]));
    const silenceCutoff = new Date(Date.now() - SILENCE_HOURS * 60 * 60 * 1000);

    // Fetch all active watches whose brand is in `shifts`.
    const watchRows = await db
      .select({
        watchId: brandWatches.id,
        userId: brandWatches.userId,
        brandId: brandWatches.brandId,
        lastNotifiedAt: brandWatches.lastNotifiedAt,
        userEmail: user.email,
        userName: user.name,
        brandSlug: brands.slug,
        brandName: brands.canonicalName,
      })
      .from(brandWatches)
      .innerJoin(user, eq(user.id, brandWatches.userId))
      .innerJoin(brands, eq(brands.id, brandWatches.brandId))
      .where(
        inArray(
          brandWatches.brandId,
          shifts.map((s) => s.brandId),
        ),
      );

    let notified = 0;
    for (const w of watchRows) {
      const shift = shiftByBrand.get(w.brandId);
      if (!shift) continue;
      if (!w.userEmail) continue;
      if (w.lastNotifiedAt && new Date(w.lastNotifiedAt) > silenceCutoff) {
        continue; // silenced
      }
      try {
        await sendBrandAlertEmail({
          to: w.userEmail,
          userName: w.userName ?? "there",
          brandName: w.brandName,
          brandSlug: w.brandSlug,
          currentPct: shift.currentPct,
          baselinePct: shift.baselinePct,
          deltaPct: shift.deltaPct,
        });
        await db
          .update(brandWatches)
          .set({ lastNotifiedAt: new Date() })
          .where(eq(brandWatches.id, w.watchId));
        notified++;
      } catch (err) {
        console.error("[benchmark-alerts] email failed", w.watchId, err);
      }
    }

    return NextResponse.json({
      success: true,
      shifts: shifts.length,
      notified,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[benchmark-alerts] error", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
