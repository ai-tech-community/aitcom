import { NextResponse } from "next/server";

import { getSession } from "@/server/better-auth/server";
import { sendHubDigestEmail } from "@/server/email";
import { getPayloadClient } from "@/server/payload";
import { renderDigestDelivery } from "@/server/notifications/digest-mail";
import {
  assertDigestTestRecipient,
  previewAccess,
  previewSendPlan,
} from "@/server/notifications/digest-preview";
import { loadHubDigests } from "@/server/notifications/load-hub-digest";
import { unsubscribeSecret } from "@/server/notifications/unsubscribe-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function callerRole(): Promise<{
  email: string;
  payloadRole: string | null;
} | null> {
  const session = await getSession();
  const email = session?.user?.email;
  if (!email) return null;
  try {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "users",
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
    });
    const role = docs[0]?.role;
    return { email, payloadRole: typeof role === "string" ? role : null };
  } catch {
    return { email, payloadRole: null };
  }
}

/** Admin preview of one member's digest. Does not record a send.
 *  `?send=greg` delivers only to greg@klevox.com. */
export async function GET(req: Request) {
  const access = previewAccess(await callerRole());
  if (access !== "ok") {
    return NextResponse.json(
      { error: access === 401 ? "Unauthorized" : "Forbidden" },
      { status: access },
    );
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const plan = previewSendPlan({
    send: url.searchParams.get("send"),
    to: url.searchParams.get("to"),
  });
  if (plan.action === "reject") {
    return NextResponse.json(
      { error: "Test send is not allowed" },
      { status: 400 },
    );
  }

  const now = new Date();
  const [member] = await loadHubDigests(now, userId);
  if (!member?.digest) {
    return NextResponse.json({ error: "Nothing to preview" }, { status: 404 });
  }

  const mail = renderDigestDelivery(
    member.digest,
    member.userId,
    now,
    unsubscribeSecret(),
  );

  if (plan.action === "send") {
    assertDigestTestRecipient(plan.to);
    try {
      const ok = await sendHubDigestEmail(
        plan.to,
        mail.html,
        mail.text,
        mail.headers,
      );
      if (!ok) {
        return NextResponse.json(
          { error: "Email is not configured" },
          { status: 503 },
        );
      }
    } catch (err) {
      console.error("digest preview test send failed", err);
      return NextResponse.json({ error: "Test send failed" }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      to: plan.to,
      wouldSend: !member.globalDigestOptOut,
    });
  }

  return new NextResponse(mail.html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-ait-digest-would-send": member.globalDigestOptOut ? "no" : "yes",
    },
  });
}
