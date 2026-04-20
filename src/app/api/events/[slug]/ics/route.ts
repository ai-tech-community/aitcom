import { NextResponse } from "next/server";
import { getPayloadClient } from "@/server/payload";
import { env } from "@/env";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIcsDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function toIcsFloating(dateStr: string, time: string): string {
  const datePart = toIcsDate(dateStr);
  const [hh = "00", mm = "00"] = time.split(":");
  return `${datePart}T${pad(Number(hh))}${pad(Number(mm))}00`;
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let remaining = line;
  chunks.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    chunks.push(" " + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  return chunks.join("\r\n");
}

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

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "https://aitcommunity.org";
  const eventUrl = `${appUrl}/events/${event.slug}`;
  const sourceUrl =
    typeof event.sourceUrl === "string" && event.sourceUrl.length > 0
      ? event.sourceUrl
      : null;

  const hasTime = typeof event.startTime === "string" && event.startTime;
  const dtStamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  const dtStartLine = hasTime
    ? `DTSTART:${toIcsFloating(event.date, event.startTime!)}`
    : `DTSTART;VALUE=DATE:${toIcsDate(event.date)}`;

  const dtEndLine = hasTime
    ? `DTEND:${toIcsFloating(event.date, event.endTime ?? event.startTime!)}`
    : null;

  const description = [
    event.summary,
    sourceUrl ? `Source: ${sourceUrl}` : null,
    hasTime ? "Times shown are local to the event location." : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AIT Community//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}-${event.slug}@aitcommunity.org`,
    `DTSTAMP:${dtStamp}`,
    dtStartLine,
    ...(dtEndLine ? [dtEndLine] : []),
    `SUMMARY:${escapeIcsText(event.title)}`,
    description ? `DESCRIPTION:${escapeIcsText(description)}` : "",
    `LOCATION:${escapeIcsText(event.location)}`,
    `URL:${sourceUrl ?? eventUrl}`,
    event.status === "cancelled" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter((line) => line.length > 0)
    .map(foldLine)
    .join("\r\n");

  return new NextResponse(lines, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
