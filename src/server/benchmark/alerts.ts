import { getResend } from "@/server/email";

export interface BrandWindowRow {
  brandId: string;
  windowDays: number;
  mentionsCount: number;
  runsTotal: number;
}

export interface BrandShift {
  brandId: string;
  currentPct: number;
  baselinePct: number;
  deltaPct: number;
}

/**
 * Group rows by (brandId, windowDays), sum mentions/runs across models,
 * compute the two window percentages, and return brands whose absolute
 * (7d - 30d) delta meets the threshold.
 */
export function detectBrandShifts(
  rows: BrandWindowRow[],
  thresholdPts: number,
): BrandShift[] {
  // Sum per (brandId, windowDays).
  const totals = new Map<string, { mentions: number; runs: number }>();
  for (const r of rows) {
    const k = `${r.brandId}|${r.windowDays}`;
    const cur = totals.get(k) ?? { mentions: 0, runs: 0 };
    cur.mentions += r.mentionsCount;
    cur.runs += r.runsTotal;
    totals.set(k, cur);
  }
  // Collect brand IDs that appear in any window.
  const brandIds = new Set<string>();
  for (const k of totals.keys()) {
    const [brandId] = k.split("|");
    if (brandId) brandIds.add(brandId);
  }
  const out: BrandShift[] = [];
  for (const brandId of brandIds) {
    const curTot = totals.get(`${brandId}|7`);
    const baseTot = totals.get(`${brandId}|30`);
    if (!curTot || !baseTot) continue;
    const currentPct =
      curTot.runs === 0 ? 0 : (curTot.mentions / curTot.runs) * 100;
    const baselinePct =
      baseTot.runs === 0 ? 0 : (baseTot.mentions / baseTot.runs) * 100;
    const deltaPct = currentPct - baselinePct;
    if (Math.abs(deltaPct) >= thresholdPts) {
      out.push({
        brandId,
        currentPct: Number(currentPct.toFixed(2)),
        baselinePct: Number(baselinePct.toFixed(2)),
        deltaPct: Number(deltaPct.toFixed(2)),
      });
    }
  }
  return out;
}

const FROM_EMAIL = "AIT Community <noreply@mailer.aitcommunity.org>";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendBrandAlertEmail(args: {
  to: string;
  userName: string;
  brandName: string;
  brandSlug: string;
  currentPct: number;
  baselinePct: number;
  deltaPct: number;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const direction = args.deltaPct >= 0 ? "up" : "down";
  const arrow = args.deltaPct >= 0 ? "↑" : "↓";
  await resend.emails.send({
    from: FROM_EMAIL,
    to: args.to,
    subject: `${arrow} ${args.brandName} visibility ${direction} ${Math.abs(args.deltaPct).toFixed(1)} pts`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="font-size: 18px;">Brand visibility shift</h2>
        <p>Hi ${escapeHtml(args.userName)},</p>
        <p><strong>${escapeHtml(args.brandName)}</strong>'s 7-day visibility is <strong>${args.currentPct.toFixed(1)}%</strong>,
        compared to a 30-day baseline of <strong>${args.baselinePct.toFixed(1)}%</strong>.</p>
        <p>That's a ${direction}ward shift of <strong>${Math.abs(args.deltaPct).toFixed(1)} points</strong>.</p>
        <p style="margin-top: 24px;">
          <a href="https://www.aitcommunity.org/en/benchmark/brands/${encodeURIComponent(args.brandSlug)}"
             style="color: #000; font-weight: bold;">
            View brand page →
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">
          You're watching this brand on AIT Community. Unwatch on the brand page.
        </p>
      </div>
    `,
  });
}
