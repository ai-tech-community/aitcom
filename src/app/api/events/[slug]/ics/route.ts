import { NextResponse } from "next/server";
import { getPayloadClient } from "@/server/payload";
import { env } from "@/env";
import { buildEventIcs, eventIcsContentType } from "@/lib/events/event-ics";

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

  const ics = buildEventIcs(event, {
    method: "publish",
    appUrl: env.NEXT_PUBLIC_APP_URL ?? "https://aitcommunity.org",
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": eventIcsContentType("publish"),
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
