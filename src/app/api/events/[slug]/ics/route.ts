import { NextResponse } from "next/server";
import { getPayloadClient } from "@/server/payload";
import { env } from "@/env";
import { buildEventIcs, eventIcsContentType } from "@/lib/events/event-ics";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { viewerMaySeeEvent } from "@/server/events/public-event-access";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  });
  const event = docs[0];
  if (!event) {
    return new NextResponse("Not found", { status: 404 });
  }
  const session = await getSession();
  const visible = await viewerMaySeeEvent(
    db,
    event.communityId ?? null,
    session?.user?.id ?? null,
  );
  if (!visible) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ics = buildEventIcs(event, {
    method: "publish",
    appUrl: env.NEXT_PUBLIC_APP_URL ?? "https://aitcommunity.org",
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": eventIcsContentType("publish"),
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
