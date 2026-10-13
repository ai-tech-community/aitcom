import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { digestSendLog } from "@/server/db/schema";
import { sendHubDigestEmail } from "@/server/email";
import { currentPeriodKey } from "@/server/notifications/constants";
import { renderDigestDelivery } from "@/server/notifications/digest-mail";
import { loadHubDigests } from "@/server/notifications/load-hub-digest";
import { unsubscribeSecret } from "@/server/notifications/unsubscribe-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const periodKey = currentPeriodKey(now);
  let sent = 0;
  const unsubSecret = unsubscribeSecret();
  if (!unsubSecret) {
    console.error(
      "hub-digest: no unsubscribe secret; sending without List-Unsubscribe",
    );
  }

  const members = await loadHubDigests(now);

  for (const member of members) {
    if (member.globalDigestOptOut || !member.digest) continue;

    // Claim-before-send: insert idempotency row first; only send if claim won.
    // At-most-once semantics: if send fails after claiming, member skips this
    // week (acceptable for weekly digest; prevents double-send / concurrent-run crash).
    const claimed = await db
      .insert(digestSendLog)
      .values({ userId: member.userId, periodKey })
      .onConflictDoNothing()
      .returning({ id: digestSendLog.id });
    if (claimed.length === 0) continue;

    const mail = renderDigestDelivery(
      member.digest,
      member.userId,
      now,
      unsubSecret,
    );

    let ok = false;
    try {
      ok = await sendHubDigestEmail(
        member.email,
        mail.html,
        mail.text,
        mail.headers,
      );
    } catch (err) {
      console.error(`hub-digest: send failed for ${member.userId}`, err);
    }
    if (ok) sent++;
  }

  return NextResponse.json({ success: true, sent, periodKey });
}
